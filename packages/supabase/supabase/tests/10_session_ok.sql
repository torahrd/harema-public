-- login-replace: 有効なログインの判定(private.session_ok / public.session_is_valid)と policy の検証
-- LR-D1(自分の行だけ・全 policy と関数に判定がある)/ LR-D2(anon と role の偽り・Data API の入口 check_request)/ LR-D3(発行元)/
-- LR-D4(30 日)/ LR-D5(ログイン単位の失効)/ LR-D6(利用者単位と全員の失効)/ LR-D11(28 文字の uid)
-- seed の u1(11111111...)/ u2(22222222...)と、private.auth_settings の demo-login-replace を使う。
-- claim は zz_claims(有効なログインの claim を設定する補助)で作り、patch で項目を壊す。
begin;
select plan(52);

-- ===== LR-D1: 全ての policy と、authenticated が実行できる関数に判定がある(catalog) =====
-- (補助関数 zz_claims を作る前に数える。補助関数は判定を持たない検査用の関数のため)
select is(
  (select count(*)::int from pg_policies where schemaname = 'public'),
  8, 'public の policy は 8 本(profiles と user_agreements の insert の policy は無い・改訂 6)'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and position('session_ok' in coalesce(qual, '') || coalesce(with_check, '')) = 0),
  0, '全ての policy の条件に session_ok の呼び出しがある(1 本でも欠ければ FAIL)'
);
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and p.proname not in ('finish_withdrawal', 'check_request')
      and position('session_ok' in p.prosrc) = 0),
  0, 'authenticated が実行できる public の関数の本体に、全て session_ok の呼び出しがある(例外は finish_withdrawal と check_request の 2 本だけ)'
);
-- 例外の finish_withdrawal は、印の後に本人のトークンが session_ok で偽になるため、退会の印の表の照合を持つ。
select ok(
  position('withdrawal_marks' in (select prosrc from pg_proc where oid = 'public.finish_withdrawal()'::regprocedure)) > 0
  and has_function_privilege('authenticated', 'public.finish_withdrawal()', 'EXECUTE'),
  'finish_withdrawal(例外の 1 本)の定義に退会の印の表の照合がある'
);
-- 例外の check_request は、要求の前の関門で行を読まない。定義に iss と role の照合を持つ。
select ok(
  position('securetoken.google.com' in (select prosrc from pg_proc where oid = 'public.check_request()'::regprocedure)) > 0
  and position('''iss''' in (select prosrc from pg_proc where oid = 'public.check_request()'::regprocedure)) > 0
  and position('''role''' in (select prosrc from pg_proc where oid = 'public.check_request()'::regprocedure)) > 0
  and has_function_privilege('authenticated', 'public.check_request()', 'EXECUTE'),
  'check_request(例外の 1 本)の定義に iss と role の照合がある'
);

-- 検査用の補助(この transaction の中だけ。rollback で消える)。有効なログインの claim を設定する。
create function public.zz_claims(p_sub text, p_age interval default interval '1 minute', p_patch jsonb default '{}'::jsonb)
returns text
language sql
as $f$
  select set_config('request.jwt.claims', (jsonb_build_object(
    'sub', p_sub,
    'role', 'authenticated',
    'iss', 'https://securetoken.google.com/demo-login-replace',
    'aud', 'demo-login-replace',
    'auth_time', extract(epoch from now() - p_age)::bigint
  ) || p_patch)::text, true)
$f$;
grant execute on function public.zz_claims(text, interval, jsonb) to public;

-- 検査用の補助: check_request を呼び、通れば 'ok'、拒まれれば 'SQLSTATE:status'(detail の status)を返す。
create function public.zz_check_request()
returns text
language plpgsql
as $f$
declare
  v_detail text;
begin
  perform public.check_request();
  return 'ok';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlstate || ':' || case when jsonb_typeof(v_detail::jsonb -> 'headers') = 'object' then coalesce(v_detail::jsonb ->> 'status', '') else 'no-headers' end;
end;
$f$;

-- ===== LR-D1: 有効なログインは自分の行だけ =====
set local role authenticated;
select public.zz_claims('11111111-1111-1111-1111-111111111111');

select is((select count(*)::int from public.profiles), 1, 'D1: u1 は自分の profiles を select できる(1 行)');

with upd as (
  update public.profiles set username = 'renamed' where id = '11111111-1111-1111-1111-111111111111' returning 1
)
select is((select count(*)::int from upd), 1, 'D1: u1 は自分の profiles を update できる(1 行)');

with upd as (
  update public.profiles set username = 'hijack' where id = '22222222-2222-2222-2222-222222222222' returning 1
)
select is((select count(*)::int from upd), 0, 'D1: u1 は u2 の profiles を update できない(0 行)');

select is((select count(*)::int from public.saved_places), 2, 'D1: u1 は自分の saved_places を select できる(2 行)');

select lives_ok(
  $$insert into public.saved_places (user_id, place_id, status)
    values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003', 'want_to_go')$$,
  'D1: u1 は自分の saved_places を insert できる'
);

with upd as (
  update public.saved_places set memo = 'edited'
   where user_id = '11111111-1111-1111-1111-111111111111' and place_id = 'a0000000-0000-0000-0000-000000000003'
  returning 1
)
select is((select count(*)::int from upd), 1, 'D1: u1 は自分の saved_places を update できる(1 行)');

with del as (
  delete from public.saved_places
   where user_id = '11111111-1111-1111-1111-111111111111' and place_id = 'a0000000-0000-0000-0000-000000000003'
  returning 1
)
select is((select count(*)::int from del), 1, 'D1: u1 は自分の saved_places を delete できる(1 行)');

select throws_ok(
  $$insert into public.saved_places (user_id, place_id, status)
    values ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000001', 'want_to_go')$$,
  '42501', null, 'D1: u1 は他人(u2)の名前で saved_places を insert できない'
);

select throws_ok(
  $$delete from public.profiles where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'D1: authenticated は profiles を直接 DELETE できない(権限が無い)'
);

select throws_ok(
  $$insert into public.profiles (id, username) values ('11111111-1111-1111-1111-111111111111', 'direct')$$,
  '42501', null, 'D1: authenticated は profiles を直接 INSERT できない(権限が無い・作るのは complete_onboarding だけ)'
);
select throws_ok(
  $$insert into public.user_agreements (user_id) values ('11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'D1: authenticated は user_agreements を直接 INSERT できない(権限が無い・作るのは complete_onboarding だけ)'
);

set local role postgres;
select is(
  (select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  1, 'D1: 直接 DELETE の後も profiles は不変'
);

-- ===== LR-D2: anon と role の偽り =====
-- anon(role なし・anon の鍵だけ)は表の権限も関数の EXECUTE も持たない(02_grants の anon の権限 0 件を保つ)。
select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT')
  and not has_table_privilege('anon', 'public.saved_places', 'SELECT')
  and not has_table_privilege('anon', 'public.places', 'SELECT')
  and not has_table_privilege('anon', 'public.user_agreements', 'SELECT'),
  'D2: anon は 4 表を読めない'
);
select ok(
  not has_function_privilege('anon', 'public.session_is_valid()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.revoke_this_session()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.begin_withdrawal()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.finish_withdrawal()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.complete_onboarding(text)', 'EXECUTE'),
  'D2: anon は session_is_valid / revoke_this_session / begin_withdrawal / finish_withdrawal / complete_onboarding を実行できない'
);
select ok(
  not has_function_privilege('anon', 'private.session_ok()', 'EXECUTE')
  and not has_schema_privilege('anon', 'private', 'USAGE'),
  'D2: anon は private スキーマを使えず session_ok も実行できない'
);

set local role authenticated;

set local role authenticated;
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '1 minute', '{"role":"anon"}'::jsonb);
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D2: claim の role が anon なら DB の役割が authenticated でも 0 行・判定は偽'
);
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '1 minute', '{"role":null}'::jsonb);
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D2: claim に role が無ければ 0 行・判定は偽'
);

-- role = service_role と書いた Firebase の形のトークン(PostgREST はトークンの role で set local role する)。
-- 記録(Postgres の性質・FAIL にしない): DB の役割 service_role は BYPASSRLS なので、set local role service_role にすれば
-- policy を素通りして行は見える(fx-2 の断言 23)。止めるのは Data API の入口の public.check_request()(pre-request)。
-- ここは呼ぶ役割 postgres のまま、request.jwt.claims だけを変えて check_request を呼ぶ。
set local role postgres;
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '1 minute', '{"role":"service_role"}'::jsonb);
select is(
  public.zz_check_request(),
  'PGRST:403',
  'D2: iss が Firebase で role = service_role の claim は check_request が 403(sqlstate PGRST)で拒む'
);
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '1 minute', '{"role":"anon"}'::jsonb);
select is(
  public.zz_check_request(),
  'PGRST:403',
  'D2: iss が Firebase で role = anon の claim は check_request が拒む'
);
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '1 minute', '{"role":null}'::jsonb);
select is(
  public.zz_check_request(),
  'PGRST:403',
  'D2: iss が Firebase で role の無い claim は check_request が拒む'
);
select public.zz_claims('11111111-1111-1111-1111-111111111111');
select is(
  public.zz_check_request(),
  'ok',
  'D2: iss が Firebase で role = authenticated の claim は check_request を通る(陽性対照)'
);
select public.zz_claims('server-secret-key', interval '1 minute', '{"role":"service_role","iss":"supabase"}'::jsonb);
select is(
  public.zz_check_request(),
  'ok',
  'D2: iss が Firebase でない role = service_role(サーバの secret key の形)は check_request を通る'
);
select is(
  (select count(*)::int
     from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
    where r.rolname = 'authenticator' and s.setdatabase = 0
      and 'pgrst.db_pre_request=public.check_request' = any (s.setconfig)),
  1, 'D2: authenticator の pgrst.db_pre_request が public.check_request に設定されている'
);
select ok(
  not has_function_privilege('anon', 'public.check_request()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.check_request()', 'EXECUTE')
  and has_function_privilege('service_role', 'public.check_request()', 'EXECUTE'),
  'D2: anon は check_request を実行できない(authenticated と service_role は実行できる)'
);
set local role authenticated;

-- ===== LR-D3: 発行元 =====
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '1 minute', '{"iss":"https://securetoken.google.com/other-project"}'::jsonb);
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D3: iss が別の project なら 0 行・判定は偽'
);
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '1 minute', '{"aud":"other-project"}'::jsonb);
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D3: aud が別の project なら 0 行・判定は偽'
);
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '1 minute', '{"iss":"http://127.0.0.1:54321/auth/v1"}'::jsonb);
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D3: iss が local の Supabase Auth(role authenticated)でも 0 行・判定は偽'
);

set local role postgres;
delete from private.auth_settings;
set local role authenticated;
select public.zz_claims('11111111-1111-1111-1111-111111111111');
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D3: private.auth_settings が 0 行なら 0 行・判定は偽(fail-closed)'
);
set local role postgres;
insert into private.auth_settings (firebase_project_id) values ('demo-login-replace');

-- ===== LR-D4: 30 日 =====
set local role authenticated;
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '29 days 23 hours');
select ok(
  public.session_is_valid() and (select count(*) from public.profiles) = 1,
  'D4: auth_time が 今 - 30 日 + 1 時間なら通る'
);
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '30 days 1 hour');
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D4: auth_time が 今 - 30 日 - 1 時間なら 0 行・判定は偽'
);
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '1 minute', '{"auth_time":null}'::jsonb);
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D4: auth_time が無ければ 0 行・判定は偽'
);
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '1 minute', '{"auth_time":"abc"}'::jsonb);
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D4: auth_time が数でなければ(例外にならず)0 行・判定は偽'
);

-- ===== LR-D5: ログイン単位の失効(同じ sub で auth_time T1 = 2 時間前 / T2 = 1 時間前) =====
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '2 hours');
select ok(public.session_is_valid(), 'D5: 失効の前は T1 のトークンが通る');
select lives_ok($$select public.revoke_this_session()$$, 'D5: T1 で revoke_this_session が成功する');
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D5: T1 のトークンは失効の後 0 行・判定は偽'
);
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '2 hours', '{"iat":9999999999}'::jsonb);
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D5: iat だけ新しい T1 のトークンも 0 行・判定は偽'
);
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '1 hour');
select ok(
  public.session_is_valid() and (select count(*) from public.profiles) = 1,
  'D5: T2 のトークンは T1 の失効の後も通る'
);
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '2 hours');
select throws_ok(
  $$select public.revoke_this_session()$$,
  'P0001', 'not authenticated', 'D5: 失効済みのログインでは revoke_this_session は not authenticated 例外'
);

-- ===== LR-D6: 利用者単位と全員の失効(u2 の auth_time は 1 時間前) =====
set local role postgres;
insert into private.user_revocations (sub, not_before)
values ('22222222-2222-2222-2222-222222222222', now() - interval '30 minutes');
set local role authenticated;
select public.zz_claims('22222222-2222-2222-2222-222222222222', interval '1 hour');
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D6: sub の not_before が auth_time より後なら 0 行・判定は偽'
);

set local role postgres;
delete from private.user_revocations;
insert into private.user_revocations (sub, not_before)
values ('22222222-2222-2222-2222-222222222222', to_timestamp(extract(epoch from now() - interval '1 hour')::bigint));
set local role authenticated;
select public.zz_claims('22222222-2222-2222-2222-222222222222', interval '1 hour');
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D6: auth_time = not_before なら止まる'
);

set local role postgres;
delete from private.user_revocations;
insert into private.user_revocations (sub, not_before)
values ('22222222-2222-2222-2222-222222222222', now() - interval '2 hours');
set local role authenticated;
select public.zz_claims('22222222-2222-2222-2222-222222222222', interval '1 hour');
select ok(
  public.session_is_valid() and (select count(*) from public.profiles) = 1,
  'D6: not_before より厳密に後の auth_time は通る'
);

set local role postgres;
delete from private.user_revocations;
insert into private.user_revocations (sub, not_before) values ('*', now() - interval '30 minutes');
set local role authenticated;
select public.zz_claims('22222222-2222-2222-2222-222222222222', interval '1 hour');
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D6: 全員(*)の not_before が後なら u2 も 0 行・判定は偽'
);
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '1 hour');
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D6: 全員(*)の not_before が後なら u1 も 0 行・判定は偽'
);

-- ===== LR-D11: 28 文字の Firebase 形の uid(uuid でない)で全ての関数と policy が動く =====
set local role postgres;
delete from private.user_revocations;
insert into private.pending_registrations (sub) values ('Xk3f9aQ2mLp7ZrT1vB8nWc5YdE0s');
set local role authenticated;
select public.zz_claims('Xk3f9aQ2mLp7ZrT1vB8nWc5YdE0s');
select lives_ok($$select public.complete_onboarding('fb_uid_user')$$, 'D11: 28 文字の uid で complete_onboarding が動く');
select is((select count(*)::int from public.profiles), 1, 'D11: 28 文字の uid で profiles の policy が動く(自分の 1 行)');
select lives_ok(
  $$insert into public.saved_places (user_id, place_id, status)
    values ('Xk3f9aQ2mLp7ZrT1vB8nWc5YdE0s', 'a0000000-0000-0000-0000-000000000001', 'visit_again')$$,
  'D11: 28 文字の uid で saved_places の policy が動く'
);
select is(
  (select allowed from public.claim_ogp_fetch(repeat('a', 64))),
  true, 'D11: 28 文字の uid で claim_ogp_fetch が動く(22P02 が出ない)'
);

set local role postgres;
select * from finish();
rollback;
