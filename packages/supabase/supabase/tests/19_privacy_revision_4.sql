-- privacy-revision-4: 26 本目の migration が足すポリシー 4 回目の改定の行(本物の行)と、その行で 25 本目の仕組みが動くこと。
-- 14・15・17・18 は 4 回目以降の行を消して自分の行を入れて検査する(文の値に左右されない)。ここは消さず、本物の行を見る。
-- 本物の適用の日時(2026-11-29 0 時 JST)の前後どちらで走らせても同じになるよう、動作の検査は適用の日時を now() からの相対に動かしてから見る。
begin;
select plan(20);

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

-- ===== R1: 本物の行 =====
select is((select count(*)::int from private.legal_revisions where doc = 'privacy' and version = 4), 1, 'R1: ポリシー 4 回目の行が 1 行在る');
select is(
  (select revised_on::text || '|' || (effective_at at time zone 'Asia/Tokyo')::text || '|' || notice::text || '|' || builtin_text::text
     from private.legal_revisions where doc = 'privacy' and version = 4),
  '2026-11-29|2026-11-29 00:00:00|true|false',
  'R1: 最終改定日 2026-11-29・適用は日本標準時の 2026-11-29 0 時・notice 真・builtin_text 偽');
select is(
  (select effective_at from private.legal_revisions where doc = 'privacy' and version = 4),
  timestamptz '2026-11-28 15:00:00+00',
  'R1: 適用は 2026-11-28T15:00:00Z(shared の LEGAL_REVISIONS と同じ瞬間)');
select is(
  (select array_length(notice_ja, 1)::text || ':' || array_length(notice_en, 1)::text from private.legal_revisions where doc = 'privacy' and version = 4),
  '1:1', 'R1: お知らせの文は日本語・英語とも 1 段落(日付の文だけ。改定の中身は web の news.ts の枠)');
select is(
  (select notice_ja[1] like '%{date}%' and notice_en[1] like '%{date}%' from private.legal_revisions where doc = 'privacy' and version = 4),
  true, 'R1: 日付の文(1 段落目)は {date} を持つ(クライアントが適用の日で埋める)');
select is(
  (select count(*)::int from private.legal_revisions where doc = 'privacy' and version <= 3 and builtin_text),
  3, 'R1: 1〜3 回目の行は builtin_text 真のまま(旧いクライアントが出す文は変わらない)');
select is(
  (select count(*)::int from private.legal_revisions),
  5, 'R1: 一覧は 5 行(規約 1・ポリシー 1〜4)');

-- ===== R2: 本物の行で、25 本目の仕組みが動く(適用の日時を now() からの相対に動かす)=====
insert into public.profiles (id, username) values ('rv-v3', 'rv3'), ('rv-v3b', 'rv3b'), ('rv-null', 'rvnull');
insert into public.user_agreements (user_id, agreed_terms_version, agreed_privacy_version, version_agreed_at) values ('rv-v3', 1, 3, now()), ('rv-v3b', 1, 3, now());
insert into public.user_agreements (user_id) values ('rv-null');
create temp table zz_row on commit drop as select notice_ja, notice_en from private.legal_revisions where doc = 'privacy' and version = 4;
grant select on zz_row to public;
-- 適用の前の「lists が見えない」を空の表で通さないため、postgres の役のうちに 1 行入れておく(門が閉じていれば authenticated には 0 件)
insert into public.lists (user_id, name) values ('rv-v3', 'pre');

update private.legal_revisions set effective_at = now() + interval '1 hour' where doc = 'privacy' and version = 4;
set local role authenticated;
select public.zz_claims('rv-v3');
select is(
  (select agreed::text || notice_due::text || lists_open::text from public.agreement_state()),
  'truefalsefalse', 'R2: 適用の前は、番号 3 の人は agreed 真・notice_due 偽・lists_open 偽');
select is((select count(*)::int from public.lists), 0, 'R2: 適用の前は lists が見えない');

set local role postgres;
update private.legal_revisions set effective_at = now() - interval '1 hour' where doc = 'privacy' and version = 4;
set local role authenticated;
select public.zz_claims('rv-v3');
select is(
  (select agreed::text || notice_due::text || lists_open::text from public.agreement_state()),
  'falsetruefalse', 'R2: 適用の後は、番号 3 の人は agreed 偽・notice_due 真・lists_open 偽(同意の前)');
select is(
  (select (s.notice_ja = z.notice_ja and s.notice_en = z.notice_en) from public.agreement_state() s, zz_row z),
  true, 'R2: 出る文は 4 回目の行の notice_ja・notice_en');
select is(
  (select (a.agreed, a.notice_due)::text from public.current_agreement() a),
  '(f,f)', 'R2: 旧い current_agreement は、4 回目(builtin_text 偽)のお知らせを数えない');
select throws_ok(
  $$insert into public.lists (user_id, name) values ('rv-v3', 'x')$$, '42501', null,
  'R2: 同意の前は lists に書けない(門)');
select public.zz_claims('rv-v3b');
select is(public.record_agreement(), 'recorded', 'R2: 番号 3 の人の旧い record_agreement は recorded(今の番号 4 を書く = 3 回目の文を見た人)');
set local role postgres;
select is(
  (select agreed_privacy_version from public.user_agreements where user_id = 'rv-v3b'), 4,
  'R2: 番号 3 の人の旧い record_agreement は 4 を書く(上限は 3 までの人にだけ掛かる)');
set local role authenticated;
select public.zz_claims('rv-v3');
select is(public.agree_current(), 'recorded', 'R2: agree_current は 4 を記録する');
select is(
  (select agreed::text || notice_due::text || lists_open::text from public.agreement_state()),
  'truefalsetrue', 'R2: 記録の後は agreed 真・notice_due 偽・lists_open 真');
select lives_ok($$insert into public.lists (user_id, name) values ('rv-v3', 'ok')$$, 'R2: 同意の後は lists に書ける');
select public.zz_claims('rv-null');
select is(public.record_agreement(), 'recorded', 'R2: 番号なしの人の旧い record_agreement は recorded');
set local role postgres;
select is(
  (select agreed_privacy_version from public.user_agreements where user_id = 'rv-null'), 3,
  'R2: 番号なしの人にも、旧い record_agreement は 3 までしか書かない');

select * from finish();
rollback;
