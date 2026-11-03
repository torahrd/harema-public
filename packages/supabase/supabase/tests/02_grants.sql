-- GRANT 検証(fail-closed 対応の要)
-- Data API 関連権限(SELECT/INSERT/UPDATE/DELETE)のみを検証する。
-- Supabase プラットフォーム既定で全ロールに付与される TRUNCATE/REFERENCES/TRIGGER/MAINTAIN は
-- 本アプリのマイグレーション対象外(schema-contract §1.1 の fail-closed は Data API 権限を指す)。
begin;
select plan(37);

-- ===== authenticated:contract 通りの Data API 権限を持つ =====
-- profiles: SELECT / UPDATE(INSERT / DELETE は無し。作るのは complete_onboarding だけ・login-replace 改訂 6)
select ok(has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'authenticated は profiles を SELECT 可');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'INSERT'), 'authenticated は profiles を INSERT 不可(complete_onboarding だけが作る)');
select ok(has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'authenticated は profiles を UPDATE 可');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'DELETE'), 'authenticated は profiles を DELETE 不可');

-- user_agreements: SELECT のみ(INSERT / UPDATE / DELETE は無し。作るのは complete_onboarding だけ・login-replace 改訂 6)
select ok(has_table_privilege('authenticated', 'public.user_agreements', 'SELECT'), 'authenticated は user_agreements を SELECT 可');
select ok(not has_table_privilege('authenticated', 'public.user_agreements', 'INSERT'), 'authenticated は user_agreements を INSERT 不可(complete_onboarding だけが作る)');
select ok(not has_table_privilege('authenticated', 'public.user_agreements', 'UPDATE'), 'authenticated は user_agreements を UPDATE 不可');
select ok(not has_table_privilege('authenticated', 'public.user_agreements', 'DELETE'), 'authenticated は user_agreements を DELETE 不可');

-- places: SELECT のみ(書込無し)
select ok(has_table_privilege('authenticated', 'public.places', 'SELECT'), 'authenticated は places を SELECT 可');
select ok(not has_table_privilege('authenticated', 'public.places', 'INSERT'), 'authenticated は places を INSERT 不可');
select ok(not has_table_privilege('authenticated', 'public.places', 'UPDATE'), 'authenticated は places を UPDATE 不可');
select ok(not has_table_privilege('authenticated', 'public.places', 'DELETE'), 'authenticated は places を DELETE 不可');

-- saved_places: SELECT / INSERT / UPDATE / DELETE
select ok(has_table_privilege('authenticated', 'public.saved_places', 'SELECT'), 'authenticated は saved_places を SELECT 可');
select ok(has_table_privilege('authenticated', 'public.saved_places', 'INSERT'), 'authenticated は saved_places を INSERT 可');
select ok(has_table_privilege('authenticated', 'public.saved_places', 'UPDATE'), 'authenticated は saved_places を UPDATE 可');
select ok(has_table_privilege('authenticated', 'public.saved_places', 'DELETE'), 'authenticated は saved_places を DELETE 可');

-- ===== anon:4 テーブルすべてに Data API 権限が無い =====
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anon は profiles を SELECT 不可');
select ok(not has_table_privilege('anon', 'public.profiles', 'INSERT'), 'anon は profiles を INSERT 不可');
select ok(not has_table_privilege('anon', 'public.profiles', 'UPDATE'), 'anon は profiles を UPDATE 不可');
select ok(not has_table_privilege('anon', 'public.profiles', 'DELETE'), 'anon は profiles を DELETE 不可');
select ok(not has_table_privilege('anon', 'public.user_agreements', 'SELECT'), 'anon は user_agreements を SELECT 不可');
select ok(not has_table_privilege('anon', 'public.user_agreements', 'INSERT'), 'anon は user_agreements を INSERT 不可');
select ok(not has_table_privilege('anon', 'public.user_agreements', 'UPDATE'), 'anon は user_agreements を UPDATE 不可');
select ok(not has_table_privilege('anon', 'public.user_agreements', 'DELETE'), 'anon は user_agreements を DELETE 不可');
select ok(not has_table_privilege('anon', 'public.places', 'SELECT'), 'anon は places を SELECT 不可');
select ok(not has_table_privilege('anon', 'public.places', 'INSERT'), 'anon は places を INSERT 不可');
select ok(not has_table_privilege('anon', 'public.places', 'UPDATE'), 'anon は places を UPDATE 不可');
select ok(not has_table_privilege('anon', 'public.places', 'DELETE'), 'anon は places を DELETE 不可');
select ok(not has_table_privilege('anon', 'public.saved_places', 'SELECT'), 'anon は saved_places を SELECT 不可');
select ok(not has_table_privilege('anon', 'public.saved_places', 'INSERT'), 'anon は saved_places を INSERT 不可');
select ok(not has_table_privilege('anon', 'public.saved_places', 'UPDATE'), 'anon は saved_places を UPDATE 不可');
select ok(not has_table_privilege('anon', 'public.saved_places', 'DELETE'), 'anon は saved_places を DELETE 不可');

-- ===== 関数 EXECUTE =====
select ok(not has_function_privilege('authenticated', 'public.upsert_place(text, numeric, numeric)', 'EXECUTE'), 'authenticated は upsert_place を EXECUTE 不可');
select ok(not has_function_privilege('anon', 'public.upsert_place(text, numeric, numeric)', 'EXECUTE'), 'anon は upsert_place を EXECUTE 不可');
select ok(has_table_privilege('service_role', 'public.places', 'INSERT') and has_table_privilege('service_role', 'public.places', 'UPDATE'), 'service_role は検証済み places を書込可');
select ok(has_function_privilege('authenticated', 'public.session_is_valid()', 'EXECUTE'), 'authenticated は session_is_valid を EXECUTE 可');
select ok(not has_function_privilege('anon', 'public.session_is_valid()', 'EXECUTE'), 'anon は session_is_valid を EXECUTE 不可');

select * from finish();
rollback;
