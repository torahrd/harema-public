-- notice-text: public.agreement_state()(同意の状態・お知らせの文・リストが開いているか)と public.agree_current()(25 本目)
-- 旧い 2 関数(current_agreement・record_agreement)の 4 回目(builtin_text 偽)の扱いは 14・15。リストの門そのものは 17。
begin;
select plan(57);

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

-- ===== S1: 権限と形 =====
select ok(
  has_function_privilege('authenticated', 'public.agreement_state()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.agreement_state()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.agreement_state()', 'EXECUTE'),
  'S1: agreement_state は authenticated だけが実行できる'
);
select ok(
  has_function_privilege('authenticated', 'public.agree_current()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.agree_current()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.agree_current()', 'EXECUTE'),
  'S1: agree_current は authenticated だけが実行できる'
);
select is(
  (select array_agg(g order by g) from (
     select distinct case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end as g
       from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
      where p.oid in ('public.agreement_state()'::regprocedure, 'public.agree_current()'::regprocedure) and a.grantee <> p.proowner) x),
  array['authenticated'], 'S1: 2 関数の EXECUTE の行は所有者のほかに authenticated だけ(PUBLIC なし)'
);
select ok(
  (select count(*) = 2 and bool_and(prosecdef and proconfig = array['search_path=""'])
     from pg_proc where oid in ('public.agreement_state()'::regprocedure, 'public.agree_current()'::regprocedure)),
  'S1: 2 関数とも security definer・search_path 固定'
);
select ok(
  (select position('session_ok' in prosrc) > 0 from pg_proc where oid = 'public.agreement_state()'::regprocedure)
  and (select position('session_ok' in prosrc) > 0 from pg_proc where oid = 'public.agree_current()'::regprocedure),
  'S1: 2 関数とも本体の先頭で session_ok を見る'
);

-- ===== S2: 4 回目の行が無い間(承認済みのポリシー 3 の文が、DB の行から返る) =====
insert into public.profiles (id, username) values ('st-null', 'stnull'), ('st-v2', 'stv2'), ('st-v3', 'stv3');
insert into public.user_agreements (user_id) values ('st-null');
insert into public.user_agreements (user_id, agreed_terms_version, agreed_privacy_version, version_agreed_at)
values ('st-v2', 1, 2, now()), ('st-v3', 1, 3, now());
insert into private.pending_registrations (sub) values ('st-pend');
set local role authenticated;
select public.zz_claims('st-v3');
select is((select count(*)::int from public.agreement_state()), 1, 'S2: 必ず 1 行');
select is((select agreed from public.agreement_state()), true, 'S2: 番号 3 の人は agreed 真(4 回目の行が無い)');
select is((select notice_due from public.agreement_state()), false, 'S2: 番号 3 の人は notice_due 偽');
select is((select lists_open from public.agreement_state()), false, 'S2: 4 回目の行が無ければ lists_open 偽');
select is(
  (select notice_effective_on is null and notice_ja is null and notice_en is null from public.agreement_state()),
  true, 'S2: notice_due が偽なら、日付と文は null');
select public.zz_claims('st-null');
select is((select notice_due from public.agreement_state()), true, 'S2: 番号なしの人は notice_due 真');
select is((select notice_effective_on from public.agreement_state()), '2026.11.22', 'S2: 番号なしの人には最も後の改定(ポリシー 3)の適用の日');
select is(
  (select notice_ja from public.agreement_state()),
  array['プライバシーポリシーを、{date} に改定しました。', '言語を選べるようにするため、Cookie の説明を加え、同意の記録の説明を改めました。'],
  'S2: ポリシー 3 の日本語の文は、承認済みの文のまま({date} を持つ)');
select is(
  (select notice_en from public.agreement_state()),
  array['We updated the Privacy Policy on {date}.', 'To let you choose a language, we added an explanation of the language cookie and revised the explanation of the record of agreement.'],
  'S2: ポリシー 3 の英語の文は、承認済みの文のまま');
select public.zz_claims('st-v2');
select is((select notice_due from public.agreement_state()), true, 'S2: 番号 2 の人は notice_due 真');
select is((select notice_effective_on from public.agreement_state()), '2026.11.22', 'S2: 番号 2 の人にもポリシー 3 の文(ポリシー 2 の行は文を持たず選ばれない)');

-- 旧い 2 関数と同じ判定(今の戻りは変わらない): notice_due・agreed が current_agreement と一致する
select is(
  (select (a.agreed, a.notice_due) = (c.agreed, c.notice_due) from public.agreement_state() a, public.current_agreement() c),
  true, 'S2: 4 回目の行が無い間、agreement_state と current_agreement の agreed・notice_due は同じ');

-- ===== S3: 登録の前・行の無い人 =====
select public.zz_claims('st-pend');
select is((select count(*)::int from public.agreement_state()), 1, 'S3: 同意前の行の人も必ず 1 行');
select is(
  (select agreed::text || notice_due::text || lists_open::text from public.agreement_state()),
  'falsefalsefalse', 'S3: 同意前の行の人(番号なし)は agreed・notice_due・lists_open とも偽');
select public.zz_claims('st-nobody');
select is((select count(*)::int from public.agreement_state()), 1, 'S3: どちらの行も無い人も必ず 1 行');
select is(
  (select agreed::text || notice_due::text || lists_open::text from public.agreement_state()),
  'falsefalsefalse', 'S3: どちらの行も無い人は 3 つとも偽');
select is((select notice_ja is null and notice_effective_on is null from public.agreement_state()), true, 'S3: 文も null');

-- ===== S4: 4 回目の行(適用の前 → 後)=====
set local role postgres;
-- 適用の日時は、JST の「昨日の 23:59:59」(日付 d)と「今日の 0:00:00」(日付 d + 1)で見る。期待の日付は暦の足し算で作る(関数の式を写さない)。
create temp table zz_d on commit drop as
  select ((now() at time zone 'Asia/Tokyo')::date - 1) as d;
grant select on zz_d to public;
insert into private.legal_revisions (doc, version, revised_on, effective_at, notice, builtin_text, notice_ja, notice_en)
values ('privacy', 4, date '2026-11-29', now() + interval '1 day', true, false,
        array['四回目の一段落目 {date}', '二段落目'], array['Fourth, para 1 {date}', 'para 2']);
set local role authenticated;
select public.zz_claims('st-v3');
select is((select notice_due from public.agreement_state()), false, 'S4: 4 回目の適用の前は、番号 3 の人に notice_due 偽');
select is((select lists_open from public.agreement_state()), false, 'S4: 適用の前は lists_open 偽');
set local role postgres;
update private.legal_revisions set effective_at = ((select d from zz_d) + time '23:59:59') at time zone 'Asia/Tokyo' where doc = 'privacy' and version = 4;
set local role authenticated;
select public.zz_claims('st-v3');
select is((select notice_due from public.agreement_state()), true, 'S4: 4 回目の適用の後は、番号 3 の人に notice_due 真');
select is((select notice_ja from public.agreement_state()), array['四回目の一段落目 {date}', '二段落目'], 'S4: 文は 4 回目の行の notice_ja');
select is((select notice_en from public.agreement_state()), array['Fourth, para 1 {date}', 'para 2'], 'S4: 英語は 4 回目の行の notice_en');
select is(
  (select notice_effective_on = to_char((select d from zz_d), 'YYYY.MM.DD') from public.agreement_state()),
  true, 'S4: 適用の日は JST の 23:59:59 なら、その暦日(0 時をまたぐ手前)');
select is((select lists_open from public.agreement_state()), false, 'S4: 同意の前は lists_open 偽');
select is((select agreed from public.agreement_state()), false, 'S4: 番号 3 の人は 4 回目の後 agreed 偽');
set local role postgres;
update private.legal_revisions set effective_at = ((select d from zz_d) + 1 + time '00:00:00') at time zone 'Asia/Tokyo' where doc = 'privacy' and version = 4;
set local role authenticated;
select public.zz_claims('st-v3');
select is(
  (select notice_effective_on = to_char((select d from zz_d) + 1, 'YYYY.MM.DD') from public.agreement_state()),
  true, 'S4: 適用の日が JST の 0:00:00 なら、次の暦日(0 時をまたいだ側)');
-- 番号なしの人: 溜まった 2 つ(3 回目と 4 回目)のうち、最も後の改定の文
select public.zz_claims('st-null');
select is((select notice_ja from public.agreement_state()), array['四回目の一段落目 {date}', '二段落目'], 'S4: 番号なしの人には、最も後の改定(4 回目)の文だけ');
-- 旧い判定は 4 回目(builtin_text 偽)を数えない
select public.zz_claims('st-v3');
select is(
  (select (a.agreed, a.notice_due, c.agreed, c.notice_due)::text from public.agreement_state() a, public.current_agreement() c),
  '(f,t,f,f)', 'S4: 番号 3 の人は、新しい関数の notice_due 真・旧い関数の notice_due 偽(agreed は両方偽)');
select public.zz_claims('st-v2');
select is(
  (select (a.notice_due, c.notice_due)::text from public.agreement_state() a, public.current_agreement() c),
  '(t,t)', 'S4: 番号 2 の人は、旧い関数も notice_due 真(3 回目 = builtin_text 真を数える)');
select public.zz_claims('st-pend');
select is((select notice_due::text || lists_open::text from public.agreement_state()), 'falsefalse', 'S4: 登録の前の人は、4 回目の後も notice_due・lists_open 偽');

-- ===== S5: agree_current =====
select public.zz_claims('st-v3');
select is(public.agree_current(), 'recorded', 'S5: 番号 3 の人の agree_current は recorded');
select is(
  (select agreed::text || notice_due::text || lists_open::text from public.agreement_state()),
  'truefalsetrue', 'S5: 記録の後は agreed 真・notice_due 偽・lists_open 真');
select is((select notice_ja is null from public.agreement_state()), true, 'S5: 記録の後は文が null');
select is(public.agree_current(), 'already', 'S5: 2 回目は already');
set local role postgres;
select is(
  (select agreed_terms_version || ':' || agreed_privacy_version from public.user_agreements where user_id = 'st-v3'),
  '1:4', 'S5: 書かれた番号は今の番号(1・4)');
set local role authenticated;
select public.zz_claims('st-null');
select is(public.agree_current(), 'recorded', 'S5: 番号なしの人の agree_current は、上限なしで今の番号を書く');
set local role postgres;
select is(
  (select agreed_terms_version || ':' || agreed_privacy_version from public.user_agreements where user_id = 'st-null'),
  '1:4', 'S5: 番号なしの人は一度で 4(旧い record_agreement のように 3 で止めない)');
set local role authenticated;
select public.zz_claims('st-pend');
select is(public.agree_current(), 'recorded', 'S5: 登録の前の人は同意前の行へ recorded');
select is((select agreed::text || lists_open::text from public.agreement_state()), 'truefalse', 'S5: 登録の前の人は記録の後 agreed 真・lists_open 偽(まだ登録していない)');
select public.zz_claims('st-nobody');
select is(public.agree_current(), 'unregistered', 'S5: どちらの行も無い人は unregistered');
set local role postgres;
select is(
  (select count(*)::int from public.user_agreements where user_id = 'st-nobody') + (select count(*)::int from private.pending_registrations where sub = 'st-nobody'),
  0, 'S5: どちらの表にも行を作らない');

-- ===== S6: 拒否 =====
set local role authenticated;
select public.zz_claims('st-v3', interval '31 days');
select throws_ok($$select * from public.agreement_state()$$, 'P0001', 'not authenticated', 'S6: 30 日を過ぎたログインは agreement_state を拒否');
select throws_ok($$select public.agree_current()$$, 'P0001', 'not authenticated', 'S6: 30 日を過ぎたログインは agree_current を拒否');
set local role anon;
select throws_ok($$select * from public.agreement_state()$$, '42501', null, 'S6: anon は agreement_state を実行できない');
select throws_ok($$select public.agree_current()$$, '42501', null, 'S6: anon は agree_current を実行できない');
set local role postgres;

-- ===== S7: CHECK(お知らせの行は文を持つ。builtin_text 真は持たなくてよい) =====
select throws_ok(
  $$insert into private.legal_revisions (doc, version, revised_on, effective_at, notice, builtin_text) values ('privacy', 8, date '2026-12-01', now(), true, false)$$,
  '23514', null, 'S7: notice 真・builtin_text 偽で文の無い行は入らない');
select throws_ok(
  $$insert into private.legal_revisions (doc, version, revised_on, effective_at, notice, notice_ja) values ('privacy', 8, date '2026-12-01', now(), true, array['x'])$$,
  '23514', null, 'S7: notice_en だけ無い行も入らない');
select lives_ok(
  $$insert into private.legal_revisions (doc, version, revised_on, effective_at, notice, builtin_text) values ('privacy', 8, date '2026-12-01', now() + interval '10 years', true, true)$$,
  'S7: builtin_text 真(ビルドに文を持つ)の notice の行は、文が無くても入る');
select lives_ok(
  $$insert into private.legal_revisions (doc, version, revised_on, effective_at, notice) values ('privacy', 9, date '2026-12-01', now() + interval '10 years', false)$$,
  'S7: notice 偽の行は文が無くても入る');
select is(
  (select array_agg(doc || ':' || version || ':' || builtin_text::text order by doc, version)
     from private.legal_revisions where version <= 3),
  array['privacy:1:true', 'privacy:2:true', 'privacy:3:true', 'terms:1:true'],
  'S7: 今の 4 行は builtin_text 真');
select is(
  (select column_default from information_schema.columns where table_schema = 'private' and table_name = 'legal_revisions' and column_name = 'builtin_text'),
  'false', 'S7: 以後の行の builtin_text の既定は偽');
select is(
  (select count(*)::int from private.legal_revisions where version <= 3 and doc = 'privacy' and version = 2 and notice_ja is null and notice_en is null),
  1, 'S7: ポリシー 2 の行は文を持たない(ポリシー 3 が適用済みで選ばれない)');

select * from finish();
rollback;
