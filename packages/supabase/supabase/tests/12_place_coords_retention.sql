-- place-refresh(#39・migration 20261103000001): 座標の 30 日の守り。
-- 列と制約(T-D1)/ 29 日の消去 purge_stale_place_coordinates(T-D2)/ 取り直しの対象 claim_place_refresh_batch
-- (T-D4・D4b・D4c・D5・D6)/ 権限(T-D7)。
-- 保存と同時の競合(消す側と保存の 2 接続)は pgTAP では作れないので、ここでは見ない(migration の冒頭の論証)。
-- 検査用の行は google_place_id が 'zz_' で始まる。seed の places は cached_at が今なので、どの対象にも入らない。
begin;
select plan(28);

-- 検査用の補助(この transaction の中だけ。rollback で消える)。
-- p_age だけ前に取得した places を作る。p_ref なら 1 人が保存した行を足す。p_coords が偽なら座標は null。
create function public.zz_mk(p_gid text, p_age interval, p_ref boolean, p_coords boolean)
returns void
language plpgsql
as $f$
declare
  v_id uuid;
begin
  insert into public.places (google_place_id, latitude, longitude, cached_at)
  values (p_gid,
          case when p_coords then 35.0 end,
          case when p_coords then 139.0 end,
          now() - p_age)
  returning id into v_id;
  if p_ref then
    insert into public.saved_places (user_id, place_id, status) values ('zz-retention-user', v_id, 'want_to_go');
  end if;
end;
$f$;

create function public.zz_clear()
returns void
language sql
as $f$
  delete from public.saved_places where place_id in (select id from public.places where google_place_id like 'zz\_%');
  delete from public.places where google_place_id like 'zz\_%';
  delete from private.place_refresh_runs;
$f$;

-- ===== T-D1: 列と制約 =====
select col_is_null('public', 'places', 'latitude', 'D1: places.latitude は nullable');
select col_is_null('public', 'places', 'longitude', 'D1: places.longitude は nullable');
select throws_ok(
  $$insert into public.places (google_place_id, latitude, longitude) values ('zz_d1_bad', null, 1)$$,
  '23514',
  'new row for relation "places" violates check constraint "places_coords_both_or_neither"',
  'D1: 片方だけ null の座標は拒否される'
);
select lives_ok(
  $$insert into public.places (google_place_id, latitude, longitude) values ('zz_d1_ok', null, null)$$,
  'D1: 両方 null は入る'
);
select public.zz_clear();

-- ===== T-D2: 29 日の消去 =====
select public.zz_mk('zz_unref30', interval '30 days', false, true);
select public.zz_mk('zz_unref1', interval '1 day', false, true);
select public.zz_mk('zz_ref29h', interval '29 days 1 hour', true, true);
select public.zz_mk('zz_ref28', interval '28 days', true, true);
select public.zz_mk('zz_ref40null', interval '40 days', true, false);

create temporary table zz_before as
  select (select count(*) from public.saved_places) as saved_count,
         (select cached_at from public.places where google_place_id = 'zz_ref29h') as ref29h_cached_at;

select private.purge_stale_place_coordinates();

select is((select count(*)::int from public.places where google_place_id = 'zz_unref30'), 0,
  'D2: 誰も保存していない 30 日の行は行ごと消える');
select is((select count(*)::int from public.places where google_place_id = 'zz_unref1'), 1,
  'D2: 誰も保存していない 1 日の行は残る');
select is((select count(*)::int from public.places where google_place_id = 'zz_ref29h'), 1,
  'D2: 保存されている 29 日 1 時間の行は残る');
select ok((select latitude is null and longitude is null from public.places where google_place_id = 'zz_ref29h'),
  'D2: 保存されている 29 日 1 時間の行は座標が null になる');
select is((select cached_at from public.places where google_place_id = 'zz_ref29h'),
  (select ref29h_cached_at from zz_before),
  'D2: 座標を null にしても cached_at は呼ぶ前と同じ');
select ok((select latitude is not null and longitude is not null from public.places where google_place_id = 'zz_ref28'),
  'D2: 保存されている 28 日の行は座標が残る');
select ok((select latitude is null and longitude is null from public.places where google_place_id = 'zz_ref40null'),
  'D2: 座標が null 済みの行は null のまま残る');
select is((select count(*)::int from public.saved_places), (select saved_count::int from zz_before),
  'D2: saved_places の行数は呼ぶ前と同じ');
drop table zz_before;
select public.zz_clear();

-- ===== T-D4: 取り直しの対象(集合の完全照合)=====
select public.zz_mk('zz_c1', interval '23 days', true, true);
select public.zz_mk('zz_c2', interval '23 days', true, true);
select public.zz_mk('zz_c3', interval '23 days', true, true);
select public.zz_mk('zz_ref10', interval '10 days', true, true);
select public.zz_mk('zz_unref25', interval '25 days', false, true);
delete from private.place_refresh_runs;

select set_eq(
  $$select google_place_id from public.claim_place_refresh_batch(10)$$,
  array['zz_c1', 'zz_c2', 'zz_c3'],
  'D4: 対象は保存されていて 22 日より前の 3 行だけ(10 日の行・未参照の行は入らない)'
);

-- ===== T-D4b: 上限 =====
delete from private.place_refresh_runs;
create temporary table zz_claimed as select google_place_id from public.claim_place_refresh_batch(2);
select is((select count(*)::int from zz_claimed), 2, 'D4b: p_limit = 2 なら 2 行');
select is((select count(*)::int from zz_claimed where google_place_id not in ('zz_c1', 'zz_c2', 'zz_c3')), 0,
  'D4b: 返った 2 行は D4 の 3 行の中');
drop table zz_claimed;

-- ===== T-D5: 同じ UTC の日は 2 回目が 0 行 =====
select is((select count(*)::int from public.claim_place_refresh_batch(2)), 0,
  'D5: 同じ日の 2 回目は 0 行');
select is((select count(*)::int from private.place_refresh_runs where run_day = (now() at time zone 'utc')::date), 1,
  'D5: 台帳に今日の UTC の日付が 1 行');
select public.zz_clear();

-- ===== T-D4c: 座標の残る行が先 =====
select public.zz_mk('zz_k1', interval '23 days', true, true);
select public.zz_mk('zz_k2', interval '23 days', true, true);
select public.zz_mk('zz_n' || g, interval '40 days', true, false) from generate_series(1, 18) g;
select set_eq(
  $$select google_place_id from public.claim_place_refresh_batch(2)$$,
  array['zz_k1', 'zz_k2'],
  'D4c: 座標の残る行が、座標の消えた行より先に選ばれる'
);
select public.zz_clear();

-- ===== T-D6: p_limit の範囲 =====
select throws_ok($$select * from public.claim_place_refresh_batch(0)$$, 'P0001', 'invalid p_limit', 'D6: p_limit = 0 は例外');
select throws_ok($$select * from public.claim_place_refresh_batch(266)$$, 'P0001', 'invalid p_limit', 'D6: p_limit = 266 は例外');
select throws_ok($$select * from public.claim_place_refresh_batch(null::integer)$$, 'P0001', 'invalid p_limit', 'D6: p_limit = null は例外');

-- ===== T-D7: 権限 =====
select is(has_function_privilege('anon', 'public.claim_place_refresh_batch(integer)', 'EXECUTE'), false, 'D7: claim は anon が呼べない');
select is(has_function_privilege('authenticated', 'public.claim_place_refresh_batch(integer)', 'EXECUTE'), false, 'D7: claim は authenticated が呼べない');
select is(has_function_privilege('service_role', 'public.claim_place_refresh_batch(integer)', 'EXECUTE'), true, 'D7: claim は service_role が呼べる');
select is(has_function_privilege('anon', 'private.purge_stale_place_coordinates()', 'EXECUTE'), false, 'D7: purge は anon が呼べない');
select is(has_function_privilege('authenticated', 'private.purge_stale_place_coordinates()', 'EXECUTE'), false, 'D7: purge は authenticated が呼べない');
select is(has_function_privilege('service_role', 'private.purge_stale_place_coordinates()', 'EXECUTE'), false, 'D7: purge は service_role が呼べない');
set local role authenticated;
select throws_ok(
  $$select * from public.claim_place_refresh_batch(1)$$,
  '42501',
  'permission denied for function claim_place_refresh_batch',
  'D7: authenticated が claim を呼ぶと 42501'
);
set local role postgres;

select * from finish();
rollback;
