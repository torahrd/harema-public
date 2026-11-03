-- 旧 upsert_place の権限封鎖と service_role のテーブル書込を検証。
-- seed の place seed_place_001(id a0000000-...-001)を使う。
-- 旧 upsert_place は postgres(関数の所有者)として呼ぶ。判定は有効なログインの claim(zz_claims)で通す。
begin;
select plan(17);

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

select public.zz_claims('11111111-1111-1111-1111-111111111111');

-- 既存 google_place_id への再呼出しは同一行 UPDATE(同じ id を返す)
select is(
  public.upsert_place('seed_place_001', 35.0, 139.0),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  '既存 google_place_id の upsert は同一行 id を返す'
);
-- cached_at が更新される(seed 時 now() の created_at より新しくなる)
select ok(
  (select cached_at > created_at from public.places where google_place_id = 'seed_place_001'),
  '再呼出しで cached_at が更新される'
);

-- 新規 google_place_id は INSERT され id が返る
select isnt(
  public.upsert_place('test_new_place_xyz', 10.0, 20.0),
  null, '新規 google_place_id の upsert は id を返す'
);
select is(
  (select count(*)::int from public.places where google_place_id = 'test_new_place_xyz'),
  1, '新規 upsert で 1 行挿入される'
);

-- 同一 google_place_id の 2 回目は同じ行(重複を作らない)
select is(
  public.upsert_place('test_new_place_xyz', 11.0, 22.0),
  (select id from public.places where google_place_id = 'test_new_place_xyz'),
  '2 回目の upsert は同一行 id を返す'
);
select is(
  (select count(*)::int from public.places where google_place_id = 'test_new_place_xyz'),
  1, '2 回目の upsert でも行は 1 つ(重複しない)'
);

-- ===== 例外:座標レンジ外・空 id・NULL =====
select throws_ok($$select public.upsert_place('', 1, 1)$$, 'P0001', 'invalid place payload', '空 id は例外');
select throws_ok($$select public.upsert_place(null, 1, 1)$$, 'P0001', 'invalid place payload', 'NULL id は例外');
select throws_ok($$select public.upsert_place('x', 91, 1)$$, 'P0001', 'invalid place payload', '緯度 > 90 は例外');
select throws_ok($$select public.upsert_place('x', -91, 1)$$, 'P0001', 'invalid place payload', '緯度 < -90 は例外');
select throws_ok($$select public.upsert_place('x', 1, 181)$$, 'P0001', 'invalid place payload', '経度 > 180 は例外');
select throws_ok($$select public.upsert_place('x', 1, -181)$$, 'P0001', 'invalid place payload', '経度 < -180 は例外');

-- ===== 旧関数を無資格のまま呼ぶと例外 =====
select set_config('request.jwt.claims', '', true);
select throws_ok($$select public.upsert_place('x', 1, 1)$$, 'P0001', 'not authenticated', '未認証は例外');

set local role authenticated;
select public.zz_claims('11111111-1111-1111-1111-111111111111');
select throws_ok($$select public.upsert_place('seed_place_001', 0, 0)$$, '42501', 'permission denied for function upsert_place', 'authenticated は旧関数で座標を書けない');
select throws_ok($$insert into public.places (google_place_id, latitude, longitude) values ('forbidden_auth', 0, 0)$$, '42501', 'permission denied for table places', 'authenticated は直接 INSERT できない');

set local role postgres;
select ok(not has_function_privilege('anon', 'public.upsert_place(text,numeric,numeric)', 'EXECUTE'), 'anon も旧関数の EXECUTE を持たない');

set local role service_role;
insert into public.places (google_place_id, latitude, longitude, cached_at) values ('service_test_place', 10, 20, now());

set local role postgres;
select is((select count(*)::int from public.places where google_place_id = 'service_test_place'), 1, 'service_role は検証済み座標を直接書ける');
select * from finish();
rollback;
