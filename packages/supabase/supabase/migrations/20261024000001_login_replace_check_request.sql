-- =============================
-- login-replace(追補・PLAN 改訂 9): Data API の入口の関門 public.check_request()
-- =============================
-- 背景(fx-2 の pgTAP の断言 23): Firebase が発行したトークンに role = 'service_role' と書かれていると、
--   PostgREST はトークンの role で `set local role service_role` する。DB の役割 service_role は BYPASSRLS なので、
--   RLS(session_ok を条件に持つ policy)を素通りして全表を読める。policy は行を見る前の関門を持てないため、
--   PostgREST の pre-request の関数(要求ごとに、役割を切り替えた後・本体の実行の前に呼ばれる)で拒む。
--
-- 判定: request.jwt.claims の iss が Firebase の発行元(https://securetoken.google.com/ で始まる)なのに
--   role が authenticated でなければ、403 で拒む。Firebase の発行のトークンが authenticated 以外の役割を名乗る
--   理由は無い(beforeUserCreated が authenticated を書く)。
--   iss が Firebase でないもの(サーバの secret key の service_role・anon の鍵)は通す(サーバの管理経路を壊さない)。
--
-- 既存の migration(19 本)は 1 byte も変えない。変更はこの新しいファイルだけで行う。
--
-- 登録(PostgREST の pre-request): `alter role authenticator set pgrst.db_pre_request` と `notify pgrst, 'reload config'`。
--   参照: https://supabase.com/docs/guides/api/securing-your-api
--
-- 残余(PLAN §0.4・§7): pre-request の外にある Storage と Realtime は、この製品で使っておらず、
--   hosted の扱いは次の単位で確かめる(この関数では覆えない)。

create function public.check_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw text;
  v_claims jsonb;
begin
  v_raw := nullif(current_setting('request.jwt.claims', true), '');
  if v_raw is null then
    return;
  end if;

  v_claims := v_raw::jsonb;

  -- iss が Firebase の発行元で、role が authenticated でないものを拒む(role が無いものも拒む)。
  if starts_with(coalesce(v_claims ->> 'iss', ''), 'https://securetoken.google.com/')
     and (v_claims ->> 'role') is distinct from 'authenticated' then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'LR403',
        'message', 'forbidden',
        'hint', 'a token issued by Firebase must carry role authenticated'
      )::text,
      detail = json_build_object('status', 403, 'headers', json_build_object())::text;
  end if;
end;
$$;

comment on function public.check_request is
  'PostgREST の pre-request の関数。Firebase の発行(iss が https://securetoken.google.com/ で始まる)のトークンが role authenticated 以外を名乗れば 403 で拒む(DB の役割 service_role は BYPASSRLS のため RLS では止まらない)。行は読まない。EXECUTE は authenticated と service_role のみ';

-- PostgREST は、役割を切り替えた後にこの関数を呼ぶ。切り替え先の役割(authenticated・service_role)が実行できる必要がある。
-- anon は、この製品で表も関数も持たない(02_grants の anon の権限 0 件を保つ)ので実行権限を付けない。
revoke all on function public.check_request() from public, anon, authenticated, service_role;
grant execute on function public.check_request() to authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.check_request';
notify pgrst, 'reload config';
