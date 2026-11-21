-- lists: リスト(public.lists / public.list_places)の契約と RLS(段 2a・PR1)
-- seed の u1(11111111...)/ u2(22222222...)を使う(u1 は place_001・place_002 の 2 行、u2 は place_003 の 1 行を保存済み)。
-- 書き換えと削除の検査は WHERE なしの文で行う(WHERE で id を指す形だと、select の policy が先に行を隠し、
-- 書き換え・削除の policy を壊しても 0 行のまま通りうる)。結果は postgres に戻って見る。
-- 退会は finish_withdrawal(自分で印を打つ lst-wd)と private.withdrawal_confirm(u1)の 2 つの経路を見る。
begin;
select plan(51);

-- 検査用の補助(この transaction の中だけ。rollback で消える)。有効なログインの claim を設定する。
create function public.zz_claims(p_sub text, p_age interval default interval '1 minute')
returns text
language sql
as $f$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub,
    'role', 'authenticated',
    'iss', 'https://securetoken.google.com/demo-login-replace',
    'aud', 'demo-login-replace',
    'auth_time', extract(epoch from now() - p_age)::bigint
  )::text, true)
$f$;
grant execute on function public.zz_claims(text, interval) to public;

-- ===== 1. 列と型 =====
select is(
  (select array_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable order by table_name, column_name)
     from information_schema.columns
    where table_schema = 'public' and table_name in ('lists', 'list_places')),
  array[
    'list_places.created_at:timestamp with time zone:NO',
    'list_places.list_id:uuid:NO',
    'list_places.saved_place_id:uuid:NO',
    'lists.created_at:timestamp with time zone:NO',
    'lists.icon:text:YES',
    'lists.id:uuid:NO',
    'lists.name:text:NO',
    'lists.updated_at:timestamp with time zone:NO',
    'lists.user_id:text:NO'
  ],
  'lists と list_places の列と型が契約どおり'
);

-- ===== 2・3. 外部キー(cascade) =====
select is(
  (select array_agg(c.confrelid::regclass::text || ':' || c.confdeltype::text order by c.confrelid::regclass::text)
     from pg_constraint c where c.conrelid = 'public.lists'::regclass and c.contype = 'f'),
  array['profiles:c'],
  'lists.user_id は profiles への外部キー(cascade)'
);
select is(
  (select array_agg(c.confrelid::regclass::text || ':' || c.confdeltype::text order by c.confrelid::regclass::text)
     from pg_constraint c where c.conrelid = 'public.list_places'::regclass and c.contype = 'f'),
  array['lists:c', 'saved_places:c'],
  'list_places は lists と saved_places への外部キー(cascade)'
);

-- ===== 4・5. RLS と policy =====
select is(
  (select count(*)::int from pg_class where oid in ('public.lists'::regclass, 'public.list_places'::regclass) and relrowsecurity),
  2, '2 表とも RLS が有効'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('lists', 'list_places') and roles = '{authenticated}'::name[]),
  7, 'policy は 7 本で、全部が authenticated 向け'
);

-- ===== 15. anon と service_role の権限の行は 2 表とも 0 件(aclexplode・PUBLIC を含む) =====
select is(
  (select count(*)::int
     from pg_class c
     cross join lateral aclexplode(coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
    where c.oid in ('public.lists'::regclass, 'public.list_places'::regclass)
      and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'service_role')))),
  0, 'anon と service_role の権限の行は 2 表とも 0 件'
);

-- ===== u1 のリストを作る =====
set local role authenticated;
select public.zz_claims('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$insert into public.lists (id, user_id, name, icon) values ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'ラーメン', 'ramen')$$,
  'u1 は自分のリストを作れる'
);
select lives_ok(
  $$insert into public.list_places (list_id, saved_place_id)
    select 'c0000000-0000-0000-0000-000000000001', id from public.saved_places where place_id = 'a0000000-0000-0000-0000-000000000001'$$,
  'u1 は自分の店を自分のリストへ入れられる'
);
select throws_ok(
  $$insert into public.list_places (list_id, saved_place_id)
    select 'c0000000-0000-0000-0000-000000000001', id from public.saved_places where place_id = 'a0000000-0000-0000-0000-000000000001'$$,
  '23505', null, '同じ店を同じリストへ 2 回は入れられない'
);
select throws_ok(
  $$insert into public.lists (user_id, name) values ('22222222-2222-2222-2222-222222222222', 'x')$$,
  '42501', null, 'u1 は u2 の名でリストを作れない'
);
select throws_ok(
  $$insert into public.lists (user_id, name) values ('11111111-1111-1111-1111-111111111111', '')$$,
  '23514', null, '空の名前は拒む'
);
select throws_ok(
  $$insert into public.lists (user_id, name) values ('11111111-1111-1111-1111-111111111111', repeat('a', 31))$$,
  '23514', null, '31 文字は拒む'
);
select throws_ok(
  $$insert into public.lists (user_id, name, icon) values ('11111111-1111-1111-1111-111111111111', 'x', repeat('a', 33))$$,
  '23514', null, 'アイコン 33 文字は拒む'
);
select throws_ok(
  $$update public.lists set user_id = '22222222-2222-2222-2222-222222222222' where id = 'c0000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'lists の user_id を他人へ書き換えられない'
);

-- ===== u2 =====
select public.zz_claims('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.lists), 0, 'u2 に u1 のリストは見えない');
select is((select count(*)::int from public.list_places), 0, 'u2 に u1 の対応は見えない');
select lives_ok(
  $$insert into public.lists (id, user_id, name) values ('c0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'u2')$$,
  'u2 は自分のリストを作れる'
);
-- u2 には u1 の保存が見えないので、u1 の保存の id は postgres で控えておく(RLS を通らない外部キーの確かめを policy が止める)
set local role postgres;
create temp table zz_u1sp as
  select id from public.saved_places where user_id = '11111111-1111-1111-1111-111111111111' order by place_id limit 1;
grant select on zz_u1sp to public;
set local role authenticated;
select public.zz_claims('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$insert into public.list_places (list_id, saved_place_id)
    select 'c0000000-0000-0000-0000-000000000002', id from zz_u1sp$$,
  '42501', null, 'u2 は自分のリストへ u1 の店を入れられない'
);
select throws_ok(
  $$insert into public.list_places (list_id, saved_place_id)
    select 'c0000000-0000-0000-0000-000000000001', id from public.saved_places where place_id = 'a0000000-0000-0000-0000-000000000003'$$,
  '42501', null, 'u2 は u1 のリストへ自分の店を入れられない'
);
select throws_ok(
  $$update public.list_places set created_at = now()$$,
  '42501', null, 'list_places は UPDATE できない'
);
-- WHERE なしの書き換えと削除(u2 から見える行は自分の u2 のリストだけ。u1 の行が残ることを postgres で見る)
select lives_ok($$update public.lists set name = 'x'$$, 'u2 の WHERE なしの lists の書き換えは通る(見える行は自分のだけ)');
select lives_ok($$delete from public.list_places$$, 'u2 の WHERE なしの list_places の削除は通る(見える行は 0)');
select lives_ok($$delete from public.lists$$, 'u2 の WHERE なしの lists の削除は通る(見える行は自分のだけ)');
set local role postgres;
select is(
  (select name from public.lists where id = 'c0000000-0000-0000-0000-000000000001'),
  'ラーメン',
  'u2 が WHERE なしで lists を書き換えても、u1 のリストの名前は変わらない'
);
select is(
  (select count(*)::int from public.list_places where list_id = 'c0000000-0000-0000-0000-000000000001'),
  1,
  'u2 が WHERE なしで list_places を消しても、u1 の対応は残る'
);
select is(
  (select count(*)::int from public.lists where id = 'c0000000-0000-0000-0000-000000000001'),
  1,
  'u2 が WHERE なしで lists を消しても、u1 のリストは残る'
);

-- ===== 14. 失効したログイン(auth_time が 30 日より前)では 0 行・書けない =====
set local role authenticated;
select public.zz_claims('11111111-1111-1111-1111-111111111111', interval '30 days 1 hour');
select is(
  (select count(*)::int from public.lists) + (select count(*)::int from public.list_places),
  0, '失効したログインでは lists も list_places も 0 行'
);
select throws_ok(
  $$insert into public.lists (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'late')$$,
  '42501', null, '失効したログインでは lists に書けない'
);

-- ===== 16. anon は読めない =====
set local role anon;
select throws_ok($$select 1 from public.lists$$, '42501', null, 'anon は lists を読めない');

-- ===== 18. profiles の無い sub はリストを作れない =====
set local role authenticated;
select public.zz_claims('lst-noprofile');
select throws_ok(
  $$insert into public.lists (user_id, name) values ('lst-noprofile', 'x')$$,
  '23503', null, 'profiles の無い sub はリストを作れない'
);

-- ===== 20. 店を消すと対応が消える・リストを消すと対応が消えて店は残る(u1 の authenticated として) =====
select public.zz_claims('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$insert into public.lists (id, user_id, name) values ('c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '渋谷')$$,
  'u1 は 2 つ目のリストを作れる'
);
select lives_ok(
  $$insert into public.list_places (list_id, saved_place_id)
    select 'c0000000-0000-0000-0000-000000000003', id from public.saved_places where place_id = 'a0000000-0000-0000-0000-000000000002'$$,
  'u1 は別の店を 2 つ目のリストへ入れられる'
);
delete from public.saved_places where place_id = 'a0000000-0000-0000-0000-000000000002';
select is(
  (select count(*)::int from public.list_places where list_id = 'c0000000-0000-0000-0000-000000000003'),
  0, '店を消すと対応が消える'
);
delete from public.lists where id = 'c0000000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.list_places where list_id = 'c0000000-0000-0000-0000-000000000001'),
  0, 'リストを消すと対応が消える'
);
select is(
  (select count(*)::int from public.saved_places where place_id = 'a0000000-0000-0000-0000-000000000001'
      and user_id = '11111111-1111-1111-1111-111111111111'),
  1, 'リストを消しても店は残る'
);

-- ===== 23. 1 人のリストの数の上限(100・トリガー private.enforce_list_limit) =====
-- この時点で u1 のリストは 1 つ(渋谷)。先に、上限の下から始まって途中で越える 1 文が丸ごと落ちることを見る(同じ文の先の行を数える)。

select throws_ok(
  $$insert into public.lists (user_id, name)
    select '11111111-1111-1111-1111-111111111111', 'burst' || g from generate_series(1, 100) g$$,
  '54000', 'list_limit_exceeded', '上限の下から始まる 1 文でも、途中で上限を越える行で落ちる(1 個 + 100 行)'
);
select is(
  (select count(*)::int from public.lists where user_id = '11111111-1111-1111-1111-111111111111'),
  1, '落ちた文の行は 1 つも残らない'
);
-- 99 個足して 100 個目まで入る。
select lives_ok(
  $$insert into public.lists (user_id, name)
    select '11111111-1111-1111-1111-111111111111', 'bulk' || g from generate_series(1, 99) g$$,
  '100 個目までは入る'
);
select is(
  (select count(*)::int from public.lists where user_id = '11111111-1111-1111-1111-111111111111'),
  100, 'u1 のリストはちょうど 100 個'
);
select throws_ok(
  $$insert into public.lists (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'over')$$,
  '54000', 'list_limit_exceeded', '101 個目は SQLSTATE 54000・message list_limit_exceeded で落ちる'
);
select throws_ok(
  $$insert into public.lists (user_id, name)
    select '11111111-1111-1111-1111-111111111111', 'over' || g from generate_series(1, 5) g$$,
  '54000', 'list_limit_exceeded', '複数行の 1 文でも上限を越えられない'
);
select public.zz_claims('22222222-2222-2222-2222-222222222222');
select lives_ok(
  $$insert into public.lists (user_id, name) values ('22222222-2222-2222-2222-222222222222', 'u2 は数に影響されない')$$,
  'u1 が 100 個でも、u2 は自分のリストを作れる'
);
select public.zz_claims('11111111-1111-1111-1111-111111111111');
delete from public.lists where name = 'bulk1';
select lives_ok(
  $$insert into public.lists (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'again')$$,
  '1 つ消すと、また 1 つ作れる'
);
set local role postgres;
select is(
  (select array_agg(g order by g)
     from (select distinct case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end as g
             from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
            where p.oid = 'private.enforce_list_limit()'::regprocedure and a.grantee <> p.proowner) x),
  null::text[], 'enforce_list_limit の EXECUTE は所有者のほかに誰も持たない'
);
select ok(
  (select not prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'private.enforce_list_limit()'::regprocedure),
  'enforce_list_limit は SECURITY INVOKER で、search_path が空に固定されている'
);
delete from public.lists where user_id = '11111111-1111-1111-1111-111111111111' and name like 'bulk%' or name in ('again', 'u2 は数に影響されない');

-- ===== 21. 退会(finish_withdrawal)でリストと対応が消える =====
set local role postgres;
insert into public.profiles (id, username) values ('lst-wd', 'wd');
insert into public.user_agreements (user_id) values ('lst-wd');
insert into public.saved_places (id, user_id, place_id, status)
values ('d0000000-0000-0000-0000-000000000001', 'lst-wd', 'a0000000-0000-0000-0000-000000000001', 'want_to_go');
insert into public.lists (id, user_id, name) values ('c0000000-0000-0000-0000-0000000000a1', 'lst-wd', 'wd');
insert into public.list_places (list_id, saved_place_id) values ('c0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-000000000001');
set local role authenticated;
select public.zz_claims('lst-wd');
select is(public.begin_withdrawal(), 'marked', '退会の印を打てる');
select lives_ok($$select public.finish_withdrawal()$$, 'finish_withdrawal が成功する');
set local role postgres;
select is(
  (select count(*)::int from public.lists where user_id = 'lst-wd')
  + (select count(*)::int from public.list_places where list_id = 'c0000000-0000-0000-0000-0000000000a1'),
  0, '退会(finish_withdrawal)で lst-wd のリストと対応が消える'
);

-- ===== 22. 退会(private.withdrawal_confirm)でリストと対応が消える =====
insert into public.lists (id, user_id, name) values ('c0000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 'wc');
insert into public.list_places (list_id, saved_place_id)
select 'c0000000-0000-0000-0000-0000000000b1', id from public.saved_places where user_id = '11111111-1111-1111-1111-111111111111' limit 1;
select is(
  (select count(*)::int from public.list_places where list_id = 'c0000000-0000-0000-0000-0000000000b1'),
  1, '退会の前に u1 の対応が在る'
);
insert into private.withdrawal_marks (sub) values ('11111111-1111-1111-1111-111111111111');
select private.withdrawal_confirm('11111111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from public.lists where user_id = '11111111-1111-1111-1111-111111111111'),
  0, '退会で u1 のリストが消える'
);
select is(
  (select count(*)::int from public.list_places where list_id = 'c0000000-0000-0000-0000-0000000000b1'),
  0, '退会で u1 の対応が消える'
);

select * from finish();
rollback;
