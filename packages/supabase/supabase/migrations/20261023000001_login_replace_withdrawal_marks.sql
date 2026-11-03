-- =============================
-- login-replace(追補): 退会の印・begin_withdrawal / finish_withdrawal・毎時の削除の退会の経路・登録の INSERT の封鎖
-- =============================
-- 背景(PLAN 改訂 5 の §0.3 退会の順・改訂 6):
--   退会と登録の中止は「印 → Firebase の削除 → 行の削除」の順で行う。
--     1. begin_withdrawal()   … 退会の印(private.withdrawal_marks)と利用者単位の失効を 1 トランザクションで書く。
--                              印の直後から private.session_ok() が、その sub の全てのトークン(印の後に新しく
--                              ログインしたものも)を拒む。ここが戻れない位置。
--     2. Firebase の accounts:delete(web)
--     3. finish_withdrawal()  … その sub の 4 表と同意前の行とログイン単位の失効を消す(印と利用者単位の失効は残す)。
--   2・3 が落ちても、毎時の削除の関数が withdrawal_claim → Firebase から消す → withdrawal_confirm で片付ける。
--   delete_my_account() は撤去する(行を先に消すと、Firebase の削除が落ちたときに同じ uid が残る)。
--
--   登録の INSERT の封鎖(改訂 6): authenticated から profiles と user_agreements の INSERT の grant と insert の
--   policy を外す。作るのは SECURITY DEFINER の complete_onboarding だけ(同意前の行と印の検査を通る)。
--
-- 既存の migration(15 本 + login-replace の 3 本)は 1 byte も変えない。変更はこの新しいファイルだけで行う。

-- =============================
-- 1. 退会の印の表
-- =============================
create table private.withdrawal_marks (
  sub text primary key check (char_length(sub) > 0),
  created_at timestamptz not null default now()
);

comment on table private.withdrawal_marks is
  '退会の印(Firebase の uid と時刻だけ)。begin_withdrawal が書き、withdrawal_confirm が消す。印のある sub は private.session_ok() が全てのトークンで偽を返す';

alter table private.withdrawal_marks enable row level security;
revoke all on table private.withdrawal_marks from public, anon, authenticated, service_role;

-- =============================
-- 2. 判定の部品:トークンの出所(role・sub・iss・aud)
-- =============================
-- session_ok と finish_withdrawal・begin_withdrawal(印のある sub の再実行)が共有する。
-- 失効・期限・印の判定は含めない(印の後は本人のトークンも session_ok では偽になるため、finish_withdrawal はこちらを使う)。
create function private.token_identity_ok()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb;
  v_sub text;
  v_project text;
begin
  v_claims := auth.jwt();
  if v_claims is null then
    return false;
  end if;

  if (v_claims ->> 'role') is distinct from 'authenticated' then
    return false;
  end if;

  v_sub := v_claims ->> 'sub';
  if v_sub is null or v_sub = '' then
    return false;
  end if;

  select s.firebase_project_id into v_project from private.auth_settings s limit 1;
  if v_project is null then
    return false;
  end if;

  if (v_claims ->> 'iss') is distinct from ('https://securetoken.google.com/' || v_project) then
    return false;
  end if;
  if (v_claims ->> 'aud') is distinct from v_project then
    return false;
  end if;

  return true;
end;
$$;

comment on function private.token_identity_ok is
  'トークンの出所の判定(role が authenticated・sub が空でない・iss と aud が private.auth_settings の project と一致)。失効・期限・退会の印は見ない。fail-closed。EXECUTE はどの役割にも付けない(SECURITY DEFINER の関数の中からだけ呼ぶ)';

revoke all on function private.token_identity_ok() from public, anon, authenticated, service_role;

-- =============================
-- 3. 有効なログインの判定に退会の印を足す(唯一の定義の差し替え)
-- =============================
-- 出所の判定は token_identity_ok に移し、auth_time(30 日)・利用者単位と全員の失効・ログイン単位の失効に、
-- 退会の印(その sub の全てのトークンを止める)を足した。EXECUTE の grant は create or replace で保たれる。
create or replace function private.session_ok()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb;
  v_sub text;
  v_auth_time_text text;
  v_auth_time bigint;
begin
  if not private.token_identity_ok() then
    return false;
  end if;

  v_claims := auth.jwt();
  v_sub := v_claims ->> 'sub';

  v_auth_time_text := v_claims ->> 'auth_time';
  if v_auth_time_text is null or v_auth_time_text !~ '^[0-9]{1,12}$' then
    return false;
  end if;
  v_auth_time := v_auth_time_text::bigint;

  if to_timestamp(v_auth_time) < now() - interval '30 days' then
    return false;
  end if;

  if exists (
    select 1
      from private.user_revocations r
     where r.sub in (v_sub, '*')
       and to_timestamp(v_auth_time) <= r.not_before
  ) then
    return false;
  end if;

  if exists (
    select 1
      from private.login_revocations l
     where l.sub = v_sub
       and l.auth_time = v_auth_time
  ) then
    return false;
  end if;

  -- 退会の印:印の後に新しくログインしたトークン(auth_time が利用者単位の失効より後)も止める。
  if exists (
    select 1
      from private.withdrawal_marks m
     where m.sub = v_sub
  ) then
    return false;
  end if;

  return true;
end;
$$;

comment on function private.session_ok is
  '有効なログインの判定の唯一の定義。出所(role / sub / iss / aud)/ auth_time(30 日)/ 利用者単位・全員・ログイン単位の失効 / 退会の印、の全てを満たすときだけ真。全 policy と SECURITY DEFINER 関数が呼ぶ。EXECUTE は authenticated のみ';

-- =============================
-- 4. begin_withdrawal(退会・登録の中止の最初の段)
-- =============================
-- 戻り:'marked' = 新しく印を書いた / 'already_marked' = 同じ sub の印がすでにある(行は増えず何も書き換えない)。
-- 新しい印を作る分岐だけが、有効なログイン(session_ok)と、profiles のある sub の 5 分以内の auth_time を要る。
-- 印のある sub の再実行(応答が落ちた後の再試行)は、出所(role・iss・aud)だけを確かめて『済み』を返す。
-- 拒否('not authenticated' / 'recent login required')は P0001。
create function public.begin_withdrawal()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub text;
  v_auth_time bigint;
  v_inserted integer;
begin
  if not private.token_identity_ok() then
    raise exception 'not authenticated';
  end if;
  v_sub := auth.jwt() ->> 'sub';

  -- 冪等:印がすでにあれば、何も書かずに『済み』。
  if exists (select 1 from private.withdrawal_marks m where m.sub = v_sub) then
    return 'already_marked';
  end if;

  -- 新しい印の分岐:有効なログインを要る。
  if not private.session_ok() then
    raise exception 'not authenticated';
  end if;
  -- session_ok が真なので auth_time は整数の秒として検証済み。
  v_auth_time := (auth.jwt() ->> 'auth_time')::bigint;

  -- 登録済み(profiles のある)利用者は、古いトークンから取り消せない退会を始めさせない(5 分以内の再認証を要る)。
  -- 同意前(profiles の無い)sub の中止は、再認証が無いので古いトークンでも通る。
  if exists (select 1 from public.profiles pr where pr.id = v_sub)
     and to_timestamp(v_auth_time) < now() - interval '5 minutes' then
    raise exception 'recent login required';
  end if;

  insert into private.withdrawal_marks (sub)
  values (v_sub)
  on conflict (sub) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    -- 同時に別の呼び出しが先に書いた。
    return 'already_marked';
  end if;

  insert into private.user_revocations as ur (sub, not_before)
  values (v_sub, now())
  on conflict (sub) do update
    set not_before = greatest(ur.not_before, excluded.not_before);

  return 'marked';
end;
$$;

comment on function public.begin_withdrawal is
  '退会・登録の中止の最初の段。退会の印と利用者単位の失効を 1 トランザクションで書く(印の直後から、その sub の全てのトークンが session_ok で偽)。戻り = marked / already_marked(印がすでにあれば出所だけ確かめて何も書かない)。新しい印は有効なログインを要し、profiles のある sub は auth_time が 5 分以内であることも要る。EXECUTE は authenticated のみ';

revoke all on function public.begin_withdrawal() from public, anon, authenticated, service_role;
grant execute on function public.begin_withdrawal() to authenticated;

-- =============================
-- 5. finish_withdrawal(Firebase の削除の後の段)
-- =============================
-- 印のある sub の本人のトークン(出所だけ確かめる。印の後は有効なログインの判定が偽になるため使えない)だけを受け、
-- その sub の 4 表・同意前の行・ログイン単位の失効を消す。印と利用者単位の失効は残す(印は毎時の削除の確認で消える)。
-- 印の無い sub は例外('no withdrawal mark')で、何も消さない。繰り返し呼んでも同じ結果(冪等)。
create function public.finish_withdrawal()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub text;
begin
  if not private.token_identity_ok() then
    raise exception 'not authenticated';
  end if;
  v_sub := auth.jwt() ->> 'sub';

  -- 印の行を for update で取る。確認(withdrawal_confirm)と直列化される。
  perform 1 from private.withdrawal_marks m where m.sub = v_sub for update;
  if not found then
    raise exception 'no withdrawal mark';
  end if;

  delete from public.saved_places where user_id = v_sub;
  delete from public.user_agreements where user_id = v_sub;
  delete from public.profiles where id = v_sub;
  delete from public.ogp_fetch_attempts where user_id = v_sub;
  delete from private.pending_registrations where sub = v_sub;
  delete from private.login_revocations where sub = v_sub;
end;
$$;

comment on function public.finish_withdrawal is
  '退会の最後の段。印のある sub の本人のトークン(出所だけ確かめる)で、その sub の saved_places / user_agreements / profiles / ogp_fetch_attempts・同意前の行・ログイン単位の失効を消す。印と利用者単位の失効は残す。印の無い sub は例外。EXECUTE は authenticated のみ';

revoke all on function public.finish_withdrawal() from public, anon, authenticated, service_role;
grant execute on function public.finish_withdrawal() to authenticated;

-- delete_my_account は撤去する(begin_withdrawal / finish_withdrawal に置き換わる)。
drop function if exists public.delete_my_account();

-- =============================
-- 6. 毎時の削除の関数が使う 2 つ(private・pending_reaper だけが実行する)
-- =============================
-- 取得:退会の印のある sub を返す(時刻の閾値なし・最大 200 件)。何も書き換えない。
-- 印が残っている間は、確認が来るまで次の取得でも返る。
create function private.withdrawal_claim()
returns table (sub text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.sub
    from private.withdrawal_marks m
   order by m.created_at, m.sub
   limit 200;
$$;

comment on function private.withdrawal_claim is
  '退会の印のある sub を返す(時刻の閾値なし・最大 200 件・何も書き換えない)。確認(withdrawal_confirm)が来るまで次の取得でも返る。呼べるのは pending_reaper だけ';

-- 確認:Firebase からの削除が済んだ(USER_NOT_FOUND も含む)sub について、毎時の削除の関数が呼ぶ。
-- 印のある sub だけ、4 表・同意前の行・ログイン単位の失効を消し、印を消し、利用者単位の失効の not_before を
-- now() 以上に進めて true を返す。印の無い sub では何も変えず false。判定と削除は同じトランザクションで行う。
create function private.withdrawal_confirm(p_sub text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_sub is null or p_sub = '' then
    return false;
  end if;

  perform 1 from private.withdrawal_marks m where m.sub = p_sub for update;
  if not found then
    return false;
  end if;

  delete from public.saved_places where user_id = p_sub;
  delete from public.user_agreements where user_id = p_sub;
  delete from public.profiles where id = p_sub;
  delete from public.ogp_fetch_attempts where user_id = p_sub;
  delete from private.pending_registrations where sub = p_sub;
  delete from private.login_revocations where sub = p_sub;
  delete from private.withdrawal_marks where sub = p_sub;

  insert into private.user_revocations as ur (sub, not_before)
  values (p_sub, now())
  on conflict (sub) do update
    set not_before = greatest(ur.not_before, excluded.not_before);

  return true;
end;
$$;

comment on function private.withdrawal_confirm is
  '印のある sub だけを、4 表・同意前の行・ログイン単位の失効から消し、印を消し、利用者単位の失効の not_before を now() 以上に進めて true を返す。印の無い sub は何も変えず false。呼べるのは pending_reaper だけ';

revoke all on function private.withdrawal_claim() from public, anon, authenticated, service_role;
revoke all on function private.withdrawal_confirm(text) from public, anon, authenticated, service_role;
grant execute on function private.withdrawal_claim() to pending_reaper;
grant execute on function private.withdrawal_confirm(text) to pending_reaper;

-- =============================
-- 7. 登録の INSERT の封鎖(改訂 6)
-- =============================
-- profiles と user_agreements を作るのは、同意前の行と印を確かめる SECURITY DEFINER の complete_onboarding だけ。
-- authenticated の直接 INSERT(同意前の行を経ない行の作成)を、grant と policy の両方で閉じる。
-- 残る authenticated の権限: profiles = SELECT / UPDATE・user_agreements = SELECT。
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "user_agreements_insert_own" on public.user_agreements;
revoke insert on table public.profiles from authenticated;
revoke insert on table public.user_agreements from authenticated;

comment on table public.profiles is
  'ユーザー固有設定(Firebase の uid と 1:1)。規約同意完了時に complete_onboarding(SECURITY DEFINER)だけが INSERT する。authenticated の権限は SELECT / UPDATE';

notify pgrst, 'reload schema';
