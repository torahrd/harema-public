-- RLS 検証:全テーブル有効 / own-only / places 全件 SELECT & 直接書込拒否 / ポリシー存在・非存在
-- seed の u1(11111111...)/ u2(22222222...)を使う。利用者 ID は Firebase の uid(text)で、
-- 有効なログインの claim(role / sub / iss / aud / auth_time)を zz_claims で設定する。
begin;
select plan(15);

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

-- ===== RLS 全テーブル有効 =====
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles で RLS 有効');
select ok((select relrowsecurity from pg_class where oid = 'public.user_agreements'::regclass), 'user_agreements で RLS 有効');
select ok((select relrowsecurity from pg_class where oid = 'public.places'::regclass), 'places で RLS 有効');
select ok((select relrowsecurity from pg_class where oid = 'public.saved_places'::regclass), 'saved_places で RLS 有効');

-- ===== places のポリシー:SELECT のみ、書込ポリシー無し =====
select ok(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='places' and policyname='places_select_authenticated') = 1,
  'places_select_authenticated が存在する'
);
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='places' and cmd in ('INSERT','UPDATE','DELETE')),
  0, 'places に INSERT/UPDATE/DELETE ポリシーが無い'
);

-- ===== authenticated(u1)として own-only を検証 =====
set local role authenticated;
select public.zz_claims('11111111-1111-1111-1111-111111111111');

select is((select count(*)::int from public.profiles), 1, 'u1 は自分の profiles 1 行のみ見える');
select is((select count(*)::int from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 0, 'u1 は u2 の profiles を見られない');
select is((select count(*)::int from public.user_agreements), 1, 'u1 は自分の user_agreements 1 行のみ見える');
select is((select count(*)::int from public.saved_places), 2, 'u1 は自分の saved_places 2 行のみ見える');
select is((select count(*)::int from public.places), 3, 'u1 は places を全件(3 行)見られる');

-- places への直接書込は拒否される(GRANT 不在 + ポリシー不在)
select throws_ok(
  $$insert into public.places (google_place_id, latitude, longitude) values ('rls_probe', 1, 1)$$,
  '42501', null, 'places への直接 INSERT は拒否される'
);
select throws_ok(
  $$update public.places set latitude = 0 where google_place_id = 'seed_place_001'$$,
  '42501', null, 'places への直接 UPDATE は拒否される'
);

-- ===== authenticated(u2)として own-only を検証 =====
select public.zz_claims('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.saved_places), 1, 'u2 は自分の saved_places 1 行のみ見える');
select is((select count(*)::int from public.saved_places where user_id = '11111111-1111-1111-1111-111111111111'), 0, 'u2 は u1 の saved_places を見られない');

set local role postgres;
select * from finish();
rollback;
