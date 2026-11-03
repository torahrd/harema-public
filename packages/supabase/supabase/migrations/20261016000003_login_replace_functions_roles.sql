-- =============================
-- login-replace(3/3): 関数の作り直し・退会とログアウト・同意前の掃除・旧い仕組みの撤去・LOGIN の役割
-- =============================
-- SECURITY DEFINER の関数は RLS を通らないので、本体の先頭で必ず private.session_ok() を呼び、
-- 偽なら例外で止める(判定は policy と同じ唯一の定義)。利用者 ID は JWT の sub(text)から取る。

-- =============================
-- 1. 同意前の表を触る 3 関数(private・専用の LOGIN の役割だけが実行する)
-- =============================
-- 登録(blocking 関数 beforeUserCreated が呼ぶ)。書けなければ呼び出し側がアカウントを作らせない。
create function private.pending_register(p_sub text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_sub is null or char_length(p_sub) < 1 or char_length(p_sub) > 128 then
    raise exception 'invalid sub';
  end if;

  insert into private.pending_registrations (sub)
  values (p_sub)
  on conflict (sub) do nothing;
end;
$$;

comment on function private.pending_register is
  '同意前のアカウントの ID を同意前の表に書く。呼べるのは pending_registrar だけ(blocking 関数 beforeUserCreated)';

-- 取得(毎時の削除の関数が呼ぶ)。24 時間を過ぎてプロフィールの無い行に「削除中」の印(claimed_at)を付け、
-- その ID を返す。印が付いて未確認の行は、確認が来るまで次の取得でも返る。1 回の上限は 200 件。
create function private.pending_claim()
returns table (sub text)
language sql
security definer
set search_path = ''
as $$
  update private.pending_registrations u
     set claimed_at = coalesce(u.claimed_at, now())
   where u.sub in (
     select p.sub
       from private.pending_registrations p
      where p.created_at < now() - interval '24 hours'
        and not exists (select 1 from public.profiles pr where pr.id = p.sub)
      order by p.created_at
      limit 200
        for update of p
   )
  returning u.sub;
$$;

comment on function private.pending_claim is
  '24 時間を過ぎてプロフィールの無い同意前の行に削除中の印を付け、その ID を返す(最大 200 件)。印の付いた行は complete_onboarding が拒む。呼べるのは pending_reaper だけ';

-- 確認(Firebase からの削除が済んだ ID について、毎時の削除の関数が呼ぶ)。
-- 渡された sub が「印の付いた同意前の行があり、かつ profiles に行が無い」ときだけ、同意前の行を含めて
-- その sub の 4 表の行を消し、利用者単位の失効を書いて true を返す。条件に合わなければ何もせず false。
-- 判定と削除は、同意前の行を for update で取った同じトランザクションの中で行う。
create function private.pending_confirm(p_sub text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.pending_registrations;
begin
  if p_sub is null or p_sub = '' then
    return false;
  end if;

  select * into v_row
    from private.pending_registrations p
   where p.sub = p_sub
     for update;
  if not found or v_row.claimed_at is null then
    return false;
  end if;

  if exists (select 1 from public.profiles pr where pr.id = p_sub) then
    return false;
  end if;

  delete from public.saved_places where user_id = p_sub;
  delete from public.user_agreements where user_id = p_sub;
  delete from public.profiles where id = p_sub;
  delete from public.ogp_fetch_attempts where user_id = p_sub;
  delete from private.login_revocations where sub = p_sub;
  delete from private.pending_registrations where sub = p_sub;

  insert into private.user_revocations as ur (sub, not_before)
  values (p_sub, now())
  on conflict (sub) do update
    set not_before = greatest(ur.not_before, excluded.not_before);

  return true;
end;
$$;

comment on function private.pending_confirm is
  '印の付いた同意前の行があり profiles に行が無い sub だけを、4 表と同意前の行から消し、利用者単位の失効を書いて true を返す。条件に合わなければ何も変えず false。呼べるのは pending_reaper だけ';

revoke all on function private.pending_register(text) from public, anon, authenticated, service_role;
revoke all on function private.pending_claim() from public, anon, authenticated, service_role;
revoke all on function private.pending_confirm(text) from public, anon, authenticated, service_role;

-- =============================
-- 2. 旧い仕組みの撤去(同意なしユーザーの auth.users の削除)
-- =============================
-- DB には同意の完了まで利用者の行を作らず、同意前のアカウントは Firebase 側にあるため、
-- auth.users を削除する関数と cron は要らない。cron の job は local と hosted の両方で外す(無ければ何もしない)。
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup_pending_users') then
    perform cron.unschedule('cleanup_pending_users');
  end if;
end;
$$;

drop function if exists public.cleanup_pending_users();

-- =============================
-- 3. 登録の完了(complete_onboarding)
-- =============================
-- profiles と user_agreements を 1 トランザクションで INSERT し、同意前の行を消す。
-- 拒否の理由(メッセージは呼び出し側が区別に使うので変えない):
--   'not authenticated'                          … 有効なログインではない(失効・期限切れ・role なし 等)
--   'invalid username'                           … ユーザー名の長さが 1〜15 でない
--   'no pending registration'                    … 同意前の行が無い(完了済み・退会済み・削除の確認済み)
--   'pending registration is being removed'      … 削除中の印が付いている(ログインし直して新しいアカウントで始める)
create or replace function public.complete_onboarding(p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub text;
  v_pending private.pending_registrations;
begin
  -- 多層防御:EXECUTE は authenticated のみに付与するが、関数内でも有効なログインを検証する。
  if not private.session_ok() then
    raise exception 'not authenticated';
  end if;
  v_sub := auth.jwt() ->> 'sub';

  -- 長さのサニティ(DB CHECK char_length(username) between 1 and 15 の鏡像)。
  -- 文字種は検証しない(使用可能文字はアプリ層 Zod で寛容に定める。ここで二重化しない)。
  if p_username is null
     or char_length(p_username) < 1
     or char_length(p_username) > 15 then
    raise exception 'invalid username';
  end if;

  -- 同意前の行を for update で取る。毎時の削除の関数の取得(印を付ける update)と直列化され、
  -- 印が付いた後の完了は必ず拒否される。
  select * into v_pending
    from private.pending_registrations p
   where p.sub = v_sub
     for update;
  if not found then
    raise exception 'no pending registration';
  end if;
  if v_pending.claimed_at is not null then
    raise exception 'pending registration is being removed';
  end if;

  -- profiles と user_agreements を同一関数本体で INSERT(= 単一トランザクション)。
  -- agreed_at / preferred_language は渡さない(DB default が唯一の真実源)。
  insert into public.profiles (id, username)
  values (v_sub, p_username);

  insert into public.user_agreements (user_id)
  values (v_sub);

  delete from private.pending_registrations where sub = v_sub;
end;
$$;

comment on function public.complete_onboarding is
  '新規ユーザーの Onboarding 完了時に profiles + user_agreements を単一トランザクションで INSERT し、同意前の行を消す唯一の経路。書込対象は JWT の sub に固定され他者の行は作れない。同意前の行が無い・削除中の印がある sub は拒否する。agreed_at / preferred_language は渡さず DB default(now() / ja)が真実源。EXECUTE は authenticated のみ';

revoke all on function public.complete_onboarding(text) from public, anon, authenticated, service_role;
grant execute on function public.complete_onboarding(text) to authenticated;

-- =============================
-- 4. places の旧い書込経路(upsert_place)
-- =============================
-- EXECUTE は誰にも付けない(20260930000001 のとおり)。本体だけ、判定を private.session_ok() に揃える。
create or replace function public.upsert_place(
  p_google_place_id text,
  p_latitude numeric,
  p_longitude numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- 多層防御:関数内でも有効なログインを検証する。
  if not private.session_ok() then
    raise exception 'not authenticated';
  end if;

  -- サーバ取得値のサニティチェック(座標レンジ・place_id 非空)
  if p_google_place_id is null or char_length(p_google_place_id) = 0
     or p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'invalid place payload';
  end if;

  insert into public.places (google_place_id, latitude, longitude, cached_at)
  values (p_google_place_id, p_latitude, p_longitude, now())
  on conflict (google_place_id) do update
    set latitude  = excluded.latitude,
        longitude = excluded.longitude,
        cached_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_place(text, numeric, numeric) from public, anon, authenticated, service_role;

-- =============================
-- 5. 出典 OGP 取得の抑制(claim / complete)— 利用者 ID を text の sub にし、判定を揃える
-- =============================
-- 本体は 20260806000001 のまま。変えたのは利用者 ID の取り方(JWT の sub)と、冒頭の有効なログインの確認だけ。
create or replace function public.claim_ogp_fetch(p_url_hash text)
returns table (allowed boolean, cached_title text)
language plpgsql
security definer
set search_path = public
as $$
declare
  c_lease      constant interval := interval '10 seconds';
  c_window     constant interval := public.ogp_fetch_window();
  c_max_starts constant integer  := 30;

  v_user text := (select auth.jwt() ->> 'sub');
  v_attempt public.ogp_fetch_attempts;
  v_starts integer;
begin
  -- 多層防御:EXECUTE は authenticated のみに付与するが、関数内でも有効なログインを検証する。
  if not private.session_ok() or v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_url_hash is null or p_url_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid url hash';
  end if;

  -- 同一ユーザーの claim を直列化する。読んでから書くまでの間に別リクエストが割り込むと、
  -- 同時実行の上限も回数上限も数え落とす(同時到着はサーバレスでは普通に起きる)。
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  -- 窓から出た行を、この利用者ぶんだけ落とす。下の回数上限は「残存行数 = 窓内で許可した回数」に
  -- 依存するので、数える前に必ず通る。cron の掃除(cleanup_ogp_fetch_attempts)は最大 1 窓ぶん
  -- 遅れて走るので、判定をそちらに委ねると数え過ぎる —— 役割が違う 2 つの掃除で、これは判定側。
  delete from public.ogp_fetch_attempts
   where user_id = v_user
     and started_at < now() - c_window;

  select * into v_attempt
    from public.ogp_fetch_attempts
   where user_id = v_user
     and url_hash = p_url_hash;

  if found then
    -- 同一 URL の再取得抑止。取れていたタイトルはそのまま返す —— 貼り直しや chip を消しての
    -- 再入力といった通常操作を、抑制で失敗表示にしないため。取れていなければ空文字(失敗のキャッシュ)。
    if v_attempt.completed_at is not null then
      return query select false, coalesce(v_attempt.title, '');
      return;
    end if;
    -- 同じ URL が実行中(paste と blur の二重発火など)。
    if v_attempt.started_at > now() - c_lease then
      return query select false, ''::text;
      return;
    end if;
    -- ここに来る行は lease 切れの取りこぼし。下で claim し直す。
  end if;

  -- 同時実行の上限:別の URL が実行中なら発火させない。
  if exists (
    select 1
      from public.ogp_fetch_attempts
     where user_id = v_user
       and completed_at is null
       and started_at > now() - c_lease
  ) then
    return query select false, ''::text;
    return;
  end if;

  -- 単位時間あたりの回数上限。掃除済みなので、残存行数がそのまま窓内で許可した回数になる。
  select count(*)::int into v_starts
    from public.ogp_fetch_attempts
   where user_id = v_user;
  if v_starts >= c_max_starts then
    return query select false, ''::text;
    return;
  end if;

  insert into public.ogp_fetch_attempts (user_id, url_hash, started_at, completed_at, title)
  values (v_user, p_url_hash, now(), null, null)
  on conflict (user_id, url_hash) do update
    set started_at = now(),
        completed_at = null,
        title = null;

  return query select true, ''::text;
end;
$$;

create or replace function public.complete_ogp_fetch(p_url_hash text, p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user text := (select auth.jwt() ->> 'sub');
begin
  if not private.session_ok() or v_user is null then
    raise exception 'not authenticated';
  end if;

  -- 実行中の行だけを閉じる。行が無ければ何もしない —— claim を経ずにキャッシュを仕込ませない
  -- (回数上限を消費せずに台帳へ書く経路を作らない)。
  update public.ogp_fetch_attempts
     set completed_at = now(),
         title = nullif(left(p_title, 200), '')
   where user_id = v_user
     and url_hash = p_url_hash
     and completed_at is null;
end;
$$;

revoke all on function public.claim_ogp_fetch(text) from public, anon, authenticated, service_role;
grant execute on function public.claim_ogp_fetch(text) to authenticated;
revoke all on function public.complete_ogp_fetch(text, text) from public, anon, authenticated, service_role;
grant execute on function public.complete_ogp_fetch(text, text) to authenticated;

-- =============================
-- 6. ログアウトと退会
-- =============================
-- ログアウト:そのログイン(sub + auth_time)だけを止める失効の行を書く。同じ sub の別のログインには効かない。
-- 失敗(有効なログインでない)は例外で、呼び出し側は cookie を消さずに失敗を示す。
create function public.revoke_this_session()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub text;
  v_auth_time bigint;
begin
  if not private.session_ok() then
    raise exception 'not authenticated';
  end if;
  v_sub := auth.jwt() ->> 'sub';
  -- session_ok が真なので auth_time は整数の秒として検証済み。
  v_auth_time := (auth.jwt() ->> 'auth_time')::bigint;

  insert into private.login_revocations (sub, auth_time)
  values (v_sub, v_auth_time)
  on conflict (sub, auth_time) do nothing;
end;
$$;

comment on function public.revoke_this_session is
  'そのログイン(sub + auth_time)だけを止める失効の行を書く。有効なログインでなければ例外。EXECUTE は authenticated のみ';

-- 退会:本人の 4 表と同意前の行を消し、利用者単位の失効(not_before = now())を書く。
-- 退会の前に出た ID トークンは auth_time <= not_before で無効になり、同じトークンで行を作り直せない。
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub text;
begin
  if not private.session_ok() then
    raise exception 'not authenticated';
  end if;
  v_sub := auth.jwt() ->> 'sub';

  delete from public.saved_places where user_id = v_sub;
  delete from public.user_agreements where user_id = v_sub;
  delete from public.profiles where id = v_sub;
  delete from public.ogp_fetch_attempts where user_id = v_sub;
  delete from private.pending_registrations where sub = v_sub;
  delete from private.login_revocations where sub = v_sub;

  insert into private.user_revocations as ur (sub, not_before)
  values (v_sub, now())
  on conflict (sub) do update
    set not_before = greatest(ur.not_before, excluded.not_before);
end;
$$;

comment on function public.delete_my_account is
  '退会。本人の saved_places / user_agreements / profiles / ogp_fetch_attempts と同意前の行を消し、利用者単位の失効を書く。有効なログインでなければ例外。EXECUTE は authenticated のみ';

revoke all on function public.revoke_this_session() from public, anon, authenticated, service_role;
grant execute on function public.revoke_this_session() to authenticated;
revoke all on function public.delete_my_account() from public, anon, authenticated, service_role;
grant execute on function public.delete_my_account() to authenticated;

-- =============================
-- 7. LOGIN の役割(Cloud Functions が同意前の表を触るためだけの 2 つ)
-- =============================
-- 役割はクラスタ単位で、supabase db reset の 2 回目以降も残るため、無いときだけ作る。
-- パスワードは migration に書かない(環境ごとに設定の時点で alter role で入れる)。
-- 表の grant は出さない。付けるのは private スキーマの USAGE と、自分の関数の EXECUTE だけ。
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pending_registrar') then
    create role pending_registrar login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'pending_reaper') then
    create role pending_reaper login;
  end if;
end;
$$;

grant usage on schema private to pending_registrar, pending_reaper;
grant execute on function private.pending_register(text) to pending_registrar;
grant execute on function private.pending_claim() to pending_reaper;
grant execute on function private.pending_confirm(text) to pending_reaper;

notify pgrst, 'reload schema';
