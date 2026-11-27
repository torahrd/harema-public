-- lists-gate: リストの門(25 本目の private.lists_ok と restrictive policy 2 本)
-- 真になるのは、本人の agreed_privacy_version が 4 以上 かつ legal_revisions に (privacy, 4) が在り effective_at <= now() の時だけ。
-- 書き換えと削除の検査は WHERE なしの文で行う(select の policy が行を隠して 0 行になるのと、門が止めて 0 行になるのを区別するため、
-- 結果は postgres に戻って数える)。リストの契約(列・permissive の policy・上限・退会)は 13_lists.sql(門が開いている人で見る)。
begin;
select plan(60);

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
-- 4 回目以降の改定(25 本目の後の migration が足す行)は消してから始める(4 回目の行が無い状態を前提にし、各節は自分で行を入れる)。
delete from private.legal_revisions where doc = 'privacy' and version >= 4;

-- 門に自分で当たる利用者: g-v4(番号 4)・g-v3(番号 3)・g-null(番号なし)・g-none(登録の前: user_agreements の行も profiles も無い)・g-b(番号 4・他人)
insert into public.profiles (id, username) values ('g-v4', 'gv4'), ('g-v3', 'gv3'), ('g-null', 'gnull'), ('g-b', 'gb');
insert into public.user_agreements (user_id, agreed_terms_version, agreed_privacy_version, version_agreed_at)
values ('g-v4', 1, 4, now()), ('g-v3', 1, 3, now()), ('g-b', 1, 4, now());
insert into public.user_agreements (user_id) values ('g-null');
-- 各人が既に持つリストと対応(postgres が直接作る。門が閉じている間も行は在り、見えない・触れないことを見る)
insert into public.saved_places (id, user_id, place_id, status)
select ('e0000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, u, 'a0000000-0000-0000-0000-000000000001'::uuid, 'want_to_go'::public.saved_place_status
  from (values (1, 'g-v4'), (2, 'g-v3'), (3, 'g-null'), (4, 'g-b')) t(n, u);
insert into public.lists (id, user_id, name)
select ('f0000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, u, 'own-' || u
  from (values (1, 'g-v4'), (2, 'g-v3'), (3, 'g-null'), (4, 'g-b')) t(n, u);
insert into public.list_places (list_id, saved_place_id)
select ('f0000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, ('e0000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
  from generate_series(1, 4) n;

-- ===== 構造: restrictive が 2 表に 1 本ずつ・関数の権限 =====
select is(
  (select array_agg(tablename || ':' || policyname || ':' || cmd || ':' || roles::text order by tablename)
     from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE'),
  array['list_places:list_places_gate:ALL:{authenticated}', 'lists:lists_gate:ALL:{authenticated}'],
  'G0: restrictive な policy は lists と list_places に 1 本ずつ(全操作・authenticated 向け)'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('lists', 'list_places') and permissive = 'PERMISSIVE'),
  7, 'G0: 公開済みの permissive の policy 7 本は変わらない'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""'] and provolatile = 's' from pg_proc where oid = 'private.lists_ok()'::regprocedure),
  'G0: private.lists_ok は security definer・stable・search_path 固定'
);
select ok(
  has_function_privilege('authenticated', 'private.lists_ok()', 'EXECUTE')
  and not has_function_privilege('anon', 'private.lists_ok()', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.lists_ok()', 'EXECUTE'),
  'G0: private.lists_ok の EXECUTE は authenticated だけ'
);
select is(
  (select array_agg(g order by g)
     from (select distinct case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end as g
             from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
            where p.oid = 'private.lists_ok()'::regprocedure and a.grantee <> p.proowner) x),
  array['authenticated'], 'G0: private.lists_ok の EXECUTE の行は所有者のほかに authenticated だけ(PUBLIC なし)'
);

-- ===== T-A1: 4 回目の行が無い間は、番号 4 を直接入れた人にも開かない =====
select is((select count(*)::int from private.legal_revisions where doc = 'privacy' and version = 4), 0, 'G1: 前提: 4 回目の行は無い');
set local role authenticated;
select public.zz_claims('g-v4');
select is(private.lists_ok(), false, 'G1: 4 回目の行が無ければ、番号 4 の行の人でも lists_ok は偽');
select is((select count(*)::int from public.lists), 0, 'G1: 行が無い間、lists の select は 0 行');
select is((select count(*)::int from public.list_places), 0, 'G1: 行が無い間、list_places の select は 0 行');
select throws_ok(
  $$insert into public.lists (user_id, name) values ('g-v4', 'new')$$,
  '42501', null, 'G1: 行が無い間、lists に書けない');
select throws_ok(
  $$insert into public.list_places (list_id, saved_place_id) values ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'G1: 行が無い間、list_places に書けない');
select lives_ok($$update public.lists set name = 'hacked'$$, 'G1: 行が無い間の WHERE なしの lists の update は 0 行で通る');
select lives_ok($$delete from public.list_places$$, 'G1: 行が無い間の WHERE なしの list_places の delete は 0 行で通る');
select lives_ok($$delete from public.lists$$, 'G1: 行が無い間の WHERE なしの lists の delete は 0 行で通る');
set local role postgres;
select is(
  (select count(*)::int from public.lists where name like 'own-%') || ':' || (select count(*)::int from public.list_places)
  || ':' || (select count(*)::int from public.lists where name = 'hacked'),
  '4:4:0', 'G1: 行が無い間、誰の lists・list_places も変わらない(postgres で数える)');

-- ===== 適用が先の 4 回目の行: 適用の前は同じ =====
insert into private.legal_revisions (doc, version, revised_on, effective_at, notice, builtin_text, notice_ja, notice_en)
values ('privacy', 4, date '2026-11-29', now() + interval '1 day', true, false, array['4回目'], array['fourth']);
set local role authenticated;
select public.zz_claims('g-v4');
select is(private.lists_ok(), false, 'G2: 適用が先なら、番号 4 の行の人でも lists_ok は偽');
select is((select count(*)::int from public.lists) + (select count(*)::int from public.list_places), 0, 'G2: 適用の前は lists も list_places も 0 行');
select throws_ok(
  $$insert into public.lists (user_id, name) values ('g-v4', 'new')$$,
  '42501', null, 'G2: 適用の前は lists に書けない');
-- 境目: effective_at が now() の 1 秒後なら偽・now() ちょうどなら真
set local role postgres;
update private.legal_revisions set effective_at = now() + interval '1 second' where doc = 'privacy' and version = 4;
set local role authenticated;
select is(private.lists_ok(), false, 'G2: effective_at が now() の 1 秒後なら偽');
set local role postgres;
update private.legal_revisions set effective_at = now() where doc = 'privacy' and version = 4;
set local role authenticated;
select is(private.lists_ok(), true, 'G2: effective_at が now() ちょうどなら真(effective_at <= now())');

-- ===== T-A2: 適用の後は、4 以上に同意した人だけ =====
set local role postgres;
update private.legal_revisions set effective_at = now() - interval '1 hour' where doc = 'privacy' and version = 4;
set local role authenticated;
select public.zz_claims('g-v3');
select is(private.lists_ok(), false, 'G3: 番号 3 の人は偽');
select is((select count(*)::int from public.lists) + (select count(*)::int from public.list_places), 0, 'G3: 番号 3 の人は lists も list_places も 0 行');
select throws_ok($$insert into public.lists (user_id, name) values ('g-v3', 'new')$$, '42501', null, 'G3: 番号 3 の人は lists に書けない');
select throws_ok(
  $$insert into public.list_places (list_id, saved_place_id) values ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'G3: 番号 3 の人は list_places に書けない(list_places の門)');
select lives_ok($$update public.lists set name = 'hacked'$$, 'G3: 番号 3 の人の WHERE なしの update は 0 行で通る');
select lives_ok($$delete from public.lists$$, 'G3: 番号 3 の人の WHERE なしの delete は 0 行で通る');
select public.zz_claims('g-null');
select is(private.lists_ok(), false, 'G3: 番号なしの人は偽');
select is((select count(*)::int from public.lists), 0, 'G3: 番号なしの人は lists が 0 行');
select throws_ok($$insert into public.lists (user_id, name) values ('g-null', 'new')$$, '42501', null, 'G3: 番号なしの人は lists に書けない');
select public.zz_claims('g-none');
select is(private.lists_ok(), false, 'G3: 登録の前(user_agreements の行が無い)の人は偽');
select is((select count(*)::int from public.lists), 0, 'G3: 登録の前の人は lists が 0 行');
select throws_ok($$insert into public.lists (user_id, name) values ('g-none', 'new')$$, '42501', null, 'G3: 登録の前の人は lists に書けない(profiles の外部キーより先に門で止まる)');
set local role postgres;
select is(
  (select count(*)::int from public.lists where name like 'own-%') || ':' || (select count(*)::int from public.list_places) || ':' || (select count(*)::int from public.lists where name = 'hacked'),
  '4:4:0', 'G3: 同意していない人の WHERE なしの update・delete の後も、誰の行も変わらない');

set local role authenticated;
select public.zz_claims('g-v4');
select is(private.lists_ok(), true, 'G4: 番号 4 の人は真');
select is((select array_agg(name order by name) from public.lists), array['own-g-v4'], 'G4: 番号 4 の人は自分のリストを読める・他人の行は見えない');
select is((select count(*)::int from public.list_places), 1, 'G4: 番号 4 の人は自分の対応を読める');
select lives_ok($$insert into public.lists (id, user_id, name) values ('f0000000-0000-0000-0000-000000000099', 'g-v4', 'second')$$, 'G4: 番号 4 の人は自分のリストを作れる');
select lives_ok(
  $$insert into public.list_places (list_id, saved_place_id) values ('f0000000-0000-0000-0000-000000000099', 'e0000000-0000-0000-0000-000000000001')$$,
  'G4: 番号 4 の人は自分の店を自分のリストへ入れられる');
select throws_ok($$insert into public.lists (user_id, name) values ('g-b', 'x')$$, '42501', null, 'G4: 番号 4 の人でも他人の名でリストを作れない(持ち主の policy は残る)');
select lives_ok($$update public.lists set name = 'renamed'$$, 'G4: 番号 4 の人の WHERE なしの update は自分の行だけ');
select lives_ok($$delete from public.list_places$$, 'G4: 番号 4 の人の WHERE なしの list_places の delete は自分の行だけ');
select lives_ok($$delete from public.lists where id = 'f0000000-0000-0000-0000-000000000099'$$, 'G4: 番号 4 の人は自分のリストを消せる');
set local role postgres;
select is(
  (select count(*)::int from public.lists where name = 'own-g-b') || ':' || (select count(*)::int from public.list_places where list_id = 'f0000000-0000-0000-0000-000000000004'),
  '1:1', 'G4: 番号 4 の人の操作の後も、他人(g-b)の行は変わらない');
select is((select name from public.lists where id = 'f0000000-0000-0000-0000-000000000001'), 'renamed', 'G4: 番号 4 の人の update は自分の行に効いた');

-- ===== 失効したログインは、番号 4 でも開かない(session_ok を持つ) =====
set local role authenticated;
select public.zz_claims('g-v4', interval '30 days 1 hour');
select is((select count(*)::int from public.lists), 0, 'G5: 失効したログインは番号 4 でも lists が 0 行');
select throws_ok($$insert into public.lists (user_id, name) values ('g-v4', 'late')$$, '42501', null, 'G5: 失効したログインは番号 4 でも書けない');
set local role anon;
select throws_ok($$select 1 from public.lists$$, '42501', null, 'G5: anon は lists を読めない');
select throws_ok($$select private.lists_ok()$$, '42501', null, 'G5: anon は lists_ok を呼べない');
set local role postgres;

-- ===== 番号を後から上げた人は、その時から開く / 適用を先へ動かすと閉じる =====
update public.user_agreements set agreed_privacy_version = 4, version_agreed_at = now() where user_id = 'g-v3';
set local role authenticated;
select public.zz_claims('g-v3');
select is(private.lists_ok(), true, 'G6: 3 の人が 4 に同意すると、その時から真');
select is((select array_agg(name order by name) from public.lists), array['own-g-v3'], 'G6: 同意した人は、持っていたリストが見える(消えていない)');
set local role postgres;
update private.legal_revisions set effective_at = now() + interval '1 day' where doc = 'privacy' and version = 4;
set local role authenticated;
select is(private.lists_ok(), false, 'G6: 4 回目の適用を先へ動かすと、同意した人にも閉じる');
set local role postgres;
update private.legal_revisions set effective_at = now() - interval '1 hour' where doc = 'privacy' and version = 4;

-- ===== 退会と保存した店の削除は、門が閉じている人にも通る(外部キーの cascade は policy を通らない) =====
-- g-v3 は上で 4 にしたので、番号 3 へ戻して、リストと対応を持つ人として見る。
update public.user_agreements set agreed_privacy_version = 3 where user_id = 'g-v3';
set local role authenticated;
select public.zz_claims('g-v3');
select is((select count(*)::int from public.lists), 0, 'G7: 前提: 番号 3 の人にはリストが見えない');
select lives_ok(
  $$delete from public.saved_places where id = 'e0000000-0000-0000-0000-000000000002'$$,
  'G7: 番号 3 の人は、リストに入っている保存した店を消せる');
set local role postgres;
select is(
  (select count(*)::int from public.list_places where saved_place_id = 'e0000000-0000-0000-0000-000000000002'),
  0, 'G7: 保存した店の削除で、対応(list_places)が cascade で消える(門を通らない)');
select is((select count(*)::int from public.lists where id = 'f0000000-0000-0000-0000-000000000002'), 1, 'G7: リストそのものは残る');
-- 退会 finish_withdrawal(番号 3 の人)
insert into public.profiles (id, username) values ('g-wd1', 'wd1'), ('g-wd2', 'wd2');
insert into public.user_agreements (user_id, agreed_terms_version, agreed_privacy_version, version_agreed_at) values ('g-wd1', 1, 3, now()), ('g-wd2', 1, 3, now());
insert into public.saved_places (id, user_id, place_id, status)
values ('e0000000-0000-0000-0000-000000000011', 'g-wd1', 'a0000000-0000-0000-0000-000000000001', 'want_to_go'),
       ('e0000000-0000-0000-0000-000000000012', 'g-wd2', 'a0000000-0000-0000-0000-000000000001', 'want_to_go');
insert into public.lists (id, user_id, name) values ('f0000000-0000-0000-0000-000000000011', 'g-wd1', 'wd1'), ('f0000000-0000-0000-0000-000000000012', 'g-wd2', 'wd2');
insert into public.list_places (list_id, saved_place_id) values
  ('f0000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000011'),
  ('f0000000-0000-0000-0000-000000000012', 'e0000000-0000-0000-0000-000000000012');
set local role authenticated;
select public.zz_claims('g-wd1');
select is(public.begin_withdrawal(), 'marked', 'G7: 番号 3 の人が退会の印を打てる');
select lives_ok($$select public.finish_withdrawal()$$, 'G7: 番号 3 の人の finish_withdrawal が通る');
set local role postgres;
select is(
  (select count(*)::int from public.lists where user_id = 'g-wd1') + (select count(*)::int from public.list_places where list_id = 'f0000000-0000-0000-0000-000000000011'),
  0, 'G7: finish_withdrawal で、門が閉じている人のリストと対応が消える');
-- 退会 private.withdrawal_confirm(番号 3 の人)
insert into private.withdrawal_marks (sub) values ('g-wd2');
select lives_ok($$select private.withdrawal_confirm('g-wd2')$$, 'G7: 番号 3 の人の withdrawal_confirm が通る');
select is(
  (select count(*)::int from public.lists where user_id = 'g-wd2') + (select count(*)::int from public.list_places where list_id = 'f0000000-0000-0000-0000-000000000012'),
  0, 'G7: withdrawal_confirm で、門が閉じている人のリストと対応が消える');

select * from finish();
rollback;
