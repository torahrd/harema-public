-- =============================
-- login-replace(1/3): private スキーマ・失効の表・同意前の表・有効なログインの判定
-- =============================
-- 背景:
--   web のログインを Firebase Authentication(Apple / Google)に置き換える。Firebase の ID トークンは
--   Supabase の third-party auth ではなく、local は signing_keys_path の手元の鍵、hosted は次の単位で
--   設定する鍵で署名を受ける。DB は「有効なログイン」の判定 private.session_ok() だけで守る。
--
-- この migration が足すもの(すべて private スキーマ。PostgREST の api.schemas に private は無いので
-- REST からは見えない。表には grant を一切出さず、触れるのは下の SECURITY DEFINER 関数だけ):
--   ・private.auth_settings        … 受け入れる Firebase project の ID(1 行)
--   ・private.user_revocations     … 利用者単位(sub)と全員('*')の失効。not_before より前のログインを止める
--   ・private.login_revocations    … ログイン単位の失効(sub + auth_time)。ログアウトで書く
--   ・private.pending_registrations… 同意前のアカウント(ID と作成時刻と「削除中」の印だけ。メールは持たない)
--   ・private.session_ok()         … 判定の本体
--   ・public.session_is_valid()    … サーバが問い合わせる口(session_ok の値を返すだけ)
--
-- 既存の 15 本の migration は凍結なので 1 byte も変えない。変更はこの 3 本の新しい migration だけで行う。

create schema if not exists private;
revoke all on schema private from public;
-- policy と関数が private.session_ok() を呼ぶために必要(表には grant を出さない)。
grant usage on schema private to authenticated;

-- =============================
-- 受け入れる project(1 行)
-- =============================
-- iss = https://securetoken.google.com/<project> かつ aud = <project> を受ける。
-- local は seed が demo-login-replace を書く。hosted は事業者の設定の後(次の単位)に所有者が書く。
-- 行が無いときは session_ok が偽を返す(fail-closed)。
create table private.auth_settings (
  singleton boolean primary key default true check (singleton),
  firebase_project_id text not null check (char_length(firebase_project_id) > 0)
);

comment on table private.auth_settings is
  '有効なログインとして受ける Firebase project の ID(1 行だけ。singleton で固定)。iss と aud の照合に使う。行が無いと private.session_ok() は偽';

-- =============================
-- 失効
-- =============================
-- 利用者単位と全員:sub または '*' と not_before の組。auth_time <= not_before のログインを止める。
-- 退会(delete_my_account)で書き、所有者の手元(SQL Editor)からの緊急の全員の失効にも使う。
create table private.user_revocations (
  sub text primary key check (char_length(sub) > 0),
  not_before timestamptz not null
);

comment on table private.user_revocations is
  '利用者単位(sub)と全員(sub = *)の失効。auth_time がこの not_before 以前のログインは無効(等しい場合も止める)。退会と所有者の緊急の失効で書く';

-- ログイン単位:sub と auth_time の組。ログアウト(revoke_this_session)で書く。
-- auth_time は ID トークンの claim の値(秒)をそのまま持ち、claim と等値で比べる。
create table private.login_revocations (
  sub text not null check (char_length(sub) > 0),
  auth_time bigint not null,
  revoked_at timestamptz not null default now(),
  primary key (sub, auth_time)
);

comment on table private.login_revocations is
  'ログイン単位の失効。同じ sub の別のログイン(別の auth_time)には効かない。ログアウトで書く。同じ秒(auth_time が等しい)の別のログインも止まる(止めすぎの側)';

-- =============================
-- 同意前のアカウント
-- =============================
-- blocking 関数(beforeUserCreated)が、作成されたアカウントの ID をここへ書く。
-- 登録の完了(complete_onboarding)で行を消す。24 時間を過ぎてプロフィールの無い行は、
-- 毎時の削除の関数が claimed_at(削除中の印)を付けて取得し、Firebase から消した後に確認する。
create table private.pending_registrations (
  sub text primary key check (char_length(sub) between 1 and 128),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create index idx_pending_registrations_created_at on private.pending_registrations (created_at);

comment on table private.pending_registrations is
  '同意前のアカウント(Firebase の uid と作成時刻だけ。メールは持たない)。claimed_at が非 NULL の行は削除中で、complete_onboarding は受け付けない';
comment on column private.pending_registrations.claimed_at is
  '削除中の印。毎時の削除の関数が取得(pending_claim)したときに付く。確認(pending_confirm)で行ごと消える';

-- 4 表とも RLS を有効にし、policy を作らず、grant も出さない(owner の SECURITY DEFINER 関数だけが触れる)。
alter table private.auth_settings enable row level security;
alter table private.user_revocations enable row level security;
alter table private.login_revocations enable row level security;
alter table private.pending_registrations enable row level security;

revoke all on table private.auth_settings from public, anon, authenticated, service_role;
revoke all on table private.user_revocations from public, anon, authenticated, service_role;
revoke all on table private.login_revocations from public, anon, authenticated, service_role;
revoke all on table private.pending_registrations from public, anon, authenticated, service_role;

-- =============================
-- 有効なログインの判定(唯一の定義)
-- =============================
-- すべて満たすときだけ真。欠けは偽(fail-closed):
--   1. claim role が authenticated
--   2. sub が空でない
--   3. private.auth_settings に project があり、iss = https://securetoken.google.com/<project>、aud = <project>
--   4. auth_time が整数の秒で、今 - 30 日以内(未来の auth_time は DB では拒まない。署名つきの値なので)
--   5. 利用者単位('sub')と全員('*')の not_before より auth_time が厳密に後
--   6. ログイン単位の失効に(sub, auth_time)が無い
-- 失効の表は呼び出し側が読めないため SECURITY DEFINER(search_path 固定・public の execute は revoke)。
create function private.session_ok()
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
  v_auth_time_text text;
  v_auth_time bigint;
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

  return true;
end;
$$;

comment on function private.session_ok is
  '有効なログインの判定の唯一の定義。role / sub / iss / aud / auth_time(30 日)/ 利用者単位・全員・ログイン単位の失効の全てを満たすときだけ真。全 policy と SECURITY DEFINER 関数が呼ぶ。EXECUTE は authenticated のみ';

revoke all on function private.session_ok() from public, anon, authenticated, service_role;
grant execute on function private.session_ok() to authenticated;

-- サーバ(getVerifiedUser)が要求ごとに問い合わせる口。判定で止めず、値を返す。
create function public.session_is_valid()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.session_ok();
$$;

comment on function public.session_is_valid is
  'private.session_ok() の値を返すだけの口。サーバが ID トークンの署名の検証の後に、失効と 30 日の確認のために問い合わせる。EXECUTE は authenticated のみ';

revoke all on function public.session_is_valid() from public, anon, authenticated, service_role;
grant execute on function public.session_is_valid() to authenticated;
