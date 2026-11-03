-- complete_onboarding(text) の属性・権限・原子性・同意前の行の扱いを検証。
-- profiles + user_agreements を単一トランザクションで INSERT し、同意前の行を消す SECURITY DEFINER 関数。
-- 同意前の行(private.pending_registrations)を postgres で作り、authenticated として関数を呼ぶ(rollback で消える)。
begin;
select plan(21);

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

-- ===== 関数属性:SECURITY DEFINER / search_path 固定 =====
select is(
  (select prosecdef from pg_proc where oid = 'public.complete_onboarding(text)'::regprocedure),
  true, 'complete_onboarding は SECURITY DEFINER'
);
select ok(
  (select proconfig from pg_proc where oid = 'public.complete_onboarding(text)'::regprocedure)
    @> ARRAY['search_path=public'],
  'complete_onboarding は search_path=public を固定'
);

-- ===== EXECUTE 権限:authenticated のみ(anon 不可・PUBLIC から REVOKE 済)=====
select ok(
  has_function_privilege('authenticated', 'public.complete_onboarding(text)', 'EXECUTE'),
  'authenticated は complete_onboarding を EXECUTE 可'
);
select ok(
  not has_function_privilege('anon', 'public.complete_onboarding(text)', 'EXECUTE'),
  'anon は complete_onboarding を EXECUTE 不可'
);

-- 検証用の同意前の行 3 名(happy / partial / reaped)。reaped は削除中の印つき。
insert into private.pending_registrations (sub, claimed_at) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', null),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', null),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', now());

-- ===== 正常系:happy ユーザーとして complete_onboarding を呼ぶ =====
set local role authenticated;
select public.zz_claims('cccccccc-cccc-cccc-cccc-cccccccccccc');

select lives_ok(
  $$select public.complete_onboarding('新規ユーザー')$$,
  'complete_onboarding は正常に完了する'
);

set local role postgres;
select is(
  (select count(*)::int from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  1, 'profiles が 1 行 INSERT される'
);
select is(
  (select username from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  '新規ユーザー', 'username が保存される'
);
select is(
  (select preferred_language from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'ja', 'preferred_language は DB default ja(引数で渡さない)'
);
select is(
  (select count(*)::int from public.user_agreements where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  1, 'user_agreements が 1 行 INSERT される'
);
select ok(
  (select agreed_at is not null from public.user_agreements where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'agreed_at は非 NULL(DB default now() で自動記録)'
);
select ok(
  (select agreed_at >= now() - interval '1 minute' from public.user_agreements where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'agreed_at は DB 側 now() 由来(直近時刻)'
);
select is(
  (select count(*)::int from private.pending_registrations where sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  0, '完了で同意前の行が消える'
);

-- ===== 原子性:2 本目(user_agreements)を衝突させると両行が残らない =====
-- 事前に user_agreements 行を作り、関数内の 2 本目 INSERT を PK 衝突させる。1 本目(profiles)は
-- 関数内で成功するが、例外により関数呼び出し全体がロールバックする(部分コミットしない)。
insert into public.user_agreements (user_id) values ('dddddddd-dddd-dddd-dddd-dddddddddddd');

set local role authenticated;
select public.zz_claims('dddddddd-dddd-dddd-dddd-dddddddddddd');

select throws_ok(
  $$select public.complete_onboarding('部分コミット検証')$$,
  '23505', null, '2 本目 INSERT の衝突で complete_onboarding は例外(unique_violation)'
);

set local role postgres;
select is(
  (select count(*)::int from public.profiles where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  0, '部分コミットしない:profiles 行が残らない(1 本目もロールバック)'
);
select is(
  (select count(*)::int from private.pending_registrations where sub = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  1, '部分コミットしない:同意前の行も消えない'
);

-- ===== 入力・認証の防御(長さの鏡像・未認証)=====
set local role authenticated;
select public.zz_claims('cccccccc-cccc-cccc-cccc-cccccccccccc');
select throws_ok(
  $$select public.complete_onboarding('')$$,
  'P0001', 'invalid username', '空 username は invalid username 例外(長さ検証が INSERT 前に発火)'
);
select throws_ok(
  $$select public.complete_onboarding('0123456789abcdef')$$,
  'P0001', 'invalid username', '16 文字 username は invalid username 例外'
);

-- ===== 同意前の行の扱い =====
select throws_ok(
  $$select public.complete_onboarding('2回目')$$,
  'P0001', 'no pending registration', '完了済みの sub の 2 回目は同意前の行が無いので拒否される'
);

select public.zz_claims('ffffffff-ffff-ffff-ffff-ffffffffffff');
select throws_ok(
  $$select public.complete_onboarding('削除中')$$,
  'P0001', 'pending registration is being removed', '削除中の印の付いた同意前の行は完了を拒否される'
);

-- ===== 有効なログインでないとき =====
select public.zz_claims('dddddddd-dddd-dddd-dddd-dddddddddddd', interval '31 days');
select throws_ok(
  $$select public.complete_onboarding('期限切れ')$$,
  'P0001', 'not authenticated', '30 日を過ぎたログインは not authenticated 例外'
);

select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$select public.complete_onboarding('x')$$,
  'P0001', 'not authenticated', '未認証(claim が無い)は not authenticated 例外'
);

set local role postgres;
select * from finish();
rollback;
