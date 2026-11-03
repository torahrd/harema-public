-- pgTAP: saved_places の DELETE own-only(WP-10 S11 / C-D4)。
-- 他人の行は 0 行削除・自分の行は 1 行削除・DELETE ポリシーは 1 本だけ存在する。
-- seed の u1(11111111...)/ u2(22222222...)を使う(u1 は place_001 / place_002 の 2 行、
-- u2 は place_003 の 1 行を所有。saved_places の migration / GRANT は既存で変更しない)。
begin;
select plan(6);

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

-- ===== DELETE ポリシーが 1 本だけ存在する =====
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='saved_places' and cmd='DELETE'),
  1, 'saved_places に DELETE ポリシーが 1 本だけ存在する'
);
select ok(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='saved_places' and policyname='saved_places_delete_own') = 1,
  'saved_places_delete_own が存在する'
);

-- ===== u2 として u1 の行を削除しようとする(他人の行は 0 行) =====
set local role authenticated;
select public.zz_claims('22222222-2222-2222-2222-222222222222');

with deleted as (
  delete from public.saved_places
  where user_id = '11111111-1111-1111-1111-111111111111'
    and place_id = 'a0000000-0000-0000-0000-000000000001'
  returning 1
)
select is((select count(*)::int from deleted), 0, 'u2 は u1 の saved_places 行を削除できない(0 行)');

-- u1 の行が u2 の削除試行後も残っていることを superuser として確認
set local role postgres;
select is(
  (select count(*)::int from public.saved_places
     where user_id = '11111111-1111-1111-1111-111111111111'
       and place_id = 'a0000000-0000-0000-0000-000000000001'),
  1, 'u1 の行は u2 の削除試行後も残っている'
);

-- ===== u1 として自分の行を削除する(自分の行は 1 行) =====
set local role authenticated;
select public.zz_claims('11111111-1111-1111-1111-111111111111');

with deleted as (
  delete from public.saved_places
  where user_id = '11111111-1111-1111-1111-111111111111'
    and place_id = 'a0000000-0000-0000-0000-000000000001'
  returning 1
)
select is((select count(*)::int from deleted), 1, 'u1 は自分の saved_places 行を削除できる(1 行)');

-- 削除後、u1 の saved_places は元の 2 行から 1 行に減っている
set local role postgres;
select is(
  (select count(*)::int from public.saved_places where user_id = '11111111-1111-1111-1111-111111111111'),
  1, 'u1 の saved_places は削除後 1 行に減っている'
);

select * from finish();
rollback;
