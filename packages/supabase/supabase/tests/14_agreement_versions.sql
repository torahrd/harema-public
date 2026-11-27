-- consent-version: 同意した規約とポリシーのバージョン番号の保管
-- (private.legal_revisions・user_agreements と pending_registrations の 3 列・record_agreement()・complete_onboarding の番号・削除)。
-- 判定とお知らせ・時刻の門は 15_agreement_current.sql。
begin;
select plan(81);

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

-- ===== V1: 改定の一覧は fail-closed =====
select ok((select relrowsecurity from pg_class where oid = 'private.legal_revisions'::regclass), 'V1: legal_revisions で RLS 有効');
select is((select count(*)::int from pg_policies where schemaname = 'private' and tablename = 'legal_revisions'), 0, 'V1: legal_revisions で policy 0');
select ok(
  not exists (
    select 1 from (values ('anon'), ('authenticated'), ('service_role'), ('pending_registrar'), ('pending_reaper')) r(rolname)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
     where has_table_privilege(r.rolname::name, 'private.legal_revisions', p.priv)
  ),
  'V1: legal_revisions はどの役割にも表の権限が無い'
);
select is(
  (select array_agg(doc || ':' || version || ':' || to_char(revised_on, 'YYYY.MM.DD') || ':' || to_char(effective_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || ':' || notice::text order by doc, version) from private.legal_revisions where not (doc = 'privacy' and version >= 4)),
  array['privacy:1:2026.11.05:2026-11-04T15:00:00Z:false', 'privacy:2:2026.11.20:2026-11-19T15:00:00Z:true', 'privacy:3:2026.11.22:2026-11-21T15:00:00Z:true', 'terms:1:2026.11.05:2026-11-04T15:00:00Z:false'],
  'V1: 一覧は 規約 1・ポリシー 1・ポリシー 2(適用 2026-11-19T15:00:00Z・notice)・ポリシー 3(適用 2026-11-21T15:00:00Z・notice)(4 回目以降の行は数えない = 25 本目の後の migration が足す行に左右されない)'
);
-- 時刻によらない形にする: 本物のポリシー 3 の適用の日時(2026-11-22 0 時 JST)をまたいで走らせても結果が変わらないよう、
-- 以後の節は「今の番号はポリシー 2」を前提にする。ポリシー 3 の適用の日時を遠い先へ置く(V8 で、適用の前後を試す所だけ 1 時間前へ動かす)。
update private.legal_revisions set effective_at = now() + interval '10 years' where doc = 'privacy' and version = 3;
-- 4 回目以降の改定(25 本目の後の migration が足す行)は消してから始める(V10 は自分で行を入れる。以後の節は、今の番号が 4 回目の行に左右されない)。
delete from private.legal_revisions where doc = 'privacy' and version >= 4;
select throws_ok($$insert into private.legal_revisions (doc, version, revised_on, effective_at, notice) values ('other', 1, date '2026-01-01', now(), false)$$, '23514', null, 'V1: doc は terms / privacy だけ');
select throws_ok($$insert into private.legal_revisions (doc, version, revised_on, effective_at, notice) values ('terms', 0, date '2026-01-01', now(), false)$$, '23514', null, 'V1: version は 1 以上');

-- ===== V2: user_agreements の 3 列(additive・既存の行は null) =====
select is(
  (select array_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '-') order by column_name)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'user_agreements'
      and column_name in ('agreed_terms_version', 'agreed_privacy_version', 'version_agreed_at')),
  array['agreed_privacy_version:integer:YES:-', 'agreed_terms_version:integer:YES:-', 'version_agreed_at:timestamp with time zone:YES:-'],
  'V2: user_agreements に 3 列(integer・integer・timestamptz・null 可・default なし)'
);
select ok(
  not has_table_privilege('authenticated', 'public.user_agreements', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.user_agreements', 'INSERT')
  and not has_table_privilege('anon', 'public.user_agreements', 'SELECT'),
  'V2: authenticated は user_agreements を UPDATE / INSERT できないまま(anon は読めない)'
);
select is(
  (select array_agg(c order by c) from (
     select column_name::text as c from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'user_agreements' and grantee = 'authenticated' and privilege_type = 'SELECT') s),
  array['agreed_at', 'agreed_privacy_version', 'agreed_terms_version', 'created_at', 'user_id', 'version_agreed_at'],
  'V2: authenticated の SELECT 権限は 3 列を含む全列(権限は足していない。行は自分の行の policy だけ)'
);
insert into public.profiles (id, username) values ('av-old', 'old');
insert into public.user_agreements (user_id) values ('av-old');
select is(
  (select agreed_terms_version is null and agreed_privacy_version is null and version_agreed_at is null from public.user_agreements where user_id = 'av-old'),
  true, 'V2: 既存の形で入れた行は番号を持たない(null)'
);
select throws_ok(
  $$insert into public.user_agreements (user_id, agreed_terms_version) values ('av-bad1', 1)$$,
  '23514', null, 'V2: 番号だけの行は CHECK で入らない'
);
select throws_ok(
  $$insert into public.user_agreements (user_id, version_agreed_at) values ('av-bad2', now())$$,
  '23514', null, 'V2: 日時だけの行は CHECK で入らない'
);
select throws_ok(
  $$insert into public.user_agreements (user_id, agreed_terms_version, agreed_privacy_version, version_agreed_at) values ('av-bad3', 0, 1, now())$$,
  '23514', null, 'V2: 番号 0 の行は CHECK で入らない'
);

-- ===== V2b: pending_registrations の 3 列 =====
select is(
  (select array_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '-') order by column_name)
     from information_schema.columns
    where table_schema = 'private' and table_name = 'pending_registrations'
      and column_name in ('agreed_terms_version', 'agreed_privacy_version', 'version_agreed_at')),
  array['agreed_privacy_version:integer:YES:-', 'agreed_terms_version:integer:YES:-', 'version_agreed_at:timestamp with time zone:YES:-'],
  'V2b: pending_registrations に 3 列(integer・integer・timestamptz・null 可・default なし)'
);
select throws_ok(
  $$insert into private.pending_registrations (sub, agreed_terms_version) values ('av-bad4', 1)$$,
  '23514', null, 'V2b: 番号だけの行は CHECK で入らない'
);
select throws_ok(
  $$insert into private.pending_registrations (sub, version_agreed_at) values ('av-bad5', now())$$,
  '23514', null, 'V2b: 日時だけの行は CHECK で入らない'
);
insert into private.pending_registrations (sub) values ('av-p0');
select is(
  (select agreed_terms_version is null and agreed_privacy_version is null and version_agreed_at is null from private.pending_registrations where sub = 'av-p0'),
  true, 'V2b: 既存の形で入れた行は null'
);
select ok(
  not exists (
    select 1 from (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
     where has_table_privilege(r.rolname::name, 'private.pending_registrations', p.priv)
  ) and (select relrowsecurity from pg_class where oid = 'private.pending_registrations'::regclass),
  'V2b: pending_registrations は RLS 有効のまま・anon / authenticated / service_role に表の権限が無い'
);

-- ===== V3: 権限 =====
select ok(
  has_function_privilege('authenticated', 'public.record_agreement()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_agreement()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.record_agreement()', 'EXECUTE'),
  'V3: record_agreement は authenticated だけが実行できる'
);
select is(
  (select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and proname = 'record_agreement'),
  1, 'V3: record_agreement は 1 つだけ(旧の引数つきの形が並ばない)'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.record_agreement()'::regprocedure),
  'V3: record_agreement は security definer・search_path 固定'
);

-- ===== V5: 記録(登録済み・user_agreements の行) =====
set local role authenticated;
select public.zz_claims('av-old');
select is(public.record_agreement(), 'recorded', 'V5: 番号なしの行は recorded');
set local role postgres;
select is(
  (select agreed_terms_version || ':' || agreed_privacy_version || ':' || (version_agreed_at between now() - interval '1 minute' and now() + interval '1 minute')::text from public.user_agreements where user_id = 'av-old'),
  '1:2:true', 'V5: 列は 規約 1・ポリシー 2・version_agreed_at は DB の時刻'
);
-- 同じトランザクションの中は now() が変わらないので、日時を遠い過去に置いてから 2 回目を呼ぶ
update public.user_agreements set version_agreed_at = timestamptz '2020-01-01 00:00:00+00' where user_id = 'av-old';
set local role authenticated;
select public.zz_claims('av-old');
select is(public.record_agreement(), 'already', 'V5: 2 回目は already');
set local role postgres;
select is(
  (select version_agreed_at from public.user_agreements where user_id = 'av-old'),
  timestamptz '2020-01-01 00:00:00+00', 'V5: 2 回目の後も version_agreed_at は 1 回目のまま'
);
select ok(
  (select agreed_at > timestamptz '2020-01-02 00:00:00+00' and agreed_at <= now() from public.user_agreements where user_id = 'av-old'),
  'V5: agreed_at(登録の時の同意の日時)は変わらない'
);

-- ===== V4b〜V4d: 記録(登録の前・同意前の行) =====
insert into private.pending_registrations (sub) values ('av-p1');
insert into private.pending_registrations (sub, created_at, claimed_at) values ('av-claimed', now() - interval '25 hours', now());
set local role authenticated;
select public.zz_claims('av-p1');
select is(public.record_agreement(), 'recorded', 'V4b: 同意前の行の人は recorded');
select is(public.record_agreement(), 'already', 'V4b: 2 回目は already');
set local role postgres;
select is(
  (select agreed_terms_version || ':' || agreed_privacy_version from private.pending_registrations where sub = 'av-p1'),
  '1:2', 'V4b: 同意前の行の列は 1 と 2'
);
select is((select count(*)::int from public.user_agreements where user_id = 'av-p1'), 0, 'V4b: user_agreements に行を作らない');

set local role authenticated;
select public.zz_claims('av-none');
select is(public.record_agreement(), 'unregistered', 'V4c: 同意前の行も user_agreements の行も無い人は unregistered');
set local role postgres;
select is(
  (select count(*)::int from private.pending_registrations where sub = 'av-none') + (select count(*)::int from public.user_agreements where user_id = 'av-none'),
  0, 'V4c: どちらの表の件数も増えない'
);
set local role authenticated;
select public.zz_claims('av-claimed');
select is(public.record_agreement(), 'unregistered', 'V4d: 削除中の印(claimed_at)のある同意前の行には書かない');
set local role postgres;
select is(
  (select agreed_terms_version is null and version_agreed_at is null from private.pending_registrations where sub = 'av-claimed'),
  true, 'V4d: 印のある行は null のまま'
);

-- ===== V6: 有効なログインでないと拒否 =====
set local role authenticated;
select public.zz_claims('av-old', interval '31 days');
select throws_ok($$select public.record_agreement()$$, 'P0001', 'not authenticated', 'V6: 30 日を過ぎたログインは拒否');
set local role postgres;
insert into private.withdrawal_marks (sub) values ('av-marked');
set local role authenticated;
select public.zz_claims('av-marked');
select throws_ok($$select public.record_agreement()$$, 'P0001', 'not authenticated', 'V6: 退会の印のある sub は拒否');
set local role anon;
select throws_ok($$select public.record_agreement()$$, '42501', null, 'V6: anon は実行できない');
set local role postgres;

-- ===== V7: 他人の行は変わらない =====
insert into public.profiles (id, username) values ('av-other', 'other');
insert into public.user_agreements (user_id) values ('av-other');
set local role authenticated;
select public.zz_claims('av-other2');
select is(public.record_agreement(), 'unregistered', 'V7: 別の sub の記録は、自分の行が無ければ unregistered');
set local role postgres;
select is(
  (select agreed_terms_version is null from public.user_agreements where user_id = 'av-other'),
  true, 'V7: 他人の user_agreements の行は変わらない'
);
select is(
  (select agreed_terms_version is null from private.pending_registrations where sub = 'av-p0'),
  true, 'V7: 他人の同意前の行も変わらない'
);
-- 自分の行を書く記録でも、他人の行は変わらない(UPDATE の where の壊しを見る)
insert into public.profiles (id, username) values ('av-v7self', 'v7self');
insert into public.user_agreements (user_id) values ('av-v7self');
set local role authenticated;
select public.zz_claims('av-v7self');
select is(public.record_agreement(), 'recorded', 'V7: 自分の行の記録は recorded');
set local role postgres;
select is(
  (select agreed_terms_version is null from public.user_agreements where user_id = 'av-other'),
  true, 'V7: 自分の行を書いた後も、他人の user_agreements の行は変わらない'
);
set local role authenticated;
select public.zz_claims('av-old');
select is((select count(*)::int from public.user_agreements), 1, 'V7: authenticated が読めるのは自分の行だけ');
select is((select agreed_terms_version from public.user_agreements), 1, 'V7: 自分の行の番号は読める');
set local role postgres;

-- ===== V8: 登録(complete_onboarding) =====
-- 同意前の行が null の登録: ログインの時刻(auth_time)に適用されていた番号と、auth_time の日時
insert into private.pending_registrations (sub) values ('av-new'), ('av-new2'), ('av-new3');
set local role authenticated;
select public.zz_claims('av-new', interval '30 minutes');
select lives_ok($$select public.complete_onboarding('newuser')$$, 'V8: complete_onboarding は今の形(p_username)で通る');
set local role postgres;
select is(
  (select agreed_terms_version || ':' || agreed_privacy_version from public.user_agreements where user_id = 'av-new'),
  '1:2', 'V8: 同意前の行が null なら、ログインの時に適用されていた番号(1・2)が入る'
);
select is(
  (select version_agreed_at between now() - interval '31 minutes' and now() - interval '29 minutes' from public.user_agreements where user_id = 'av-new'),
  true, 'V8: 同意前の行が null の登録は、version_agreed_at が auth_time'
);
-- 改定の適用より前のログイン: ポリシー 3 の適用の日時を 1 時間前へ動かす(本物の行の日時をテストの中で置き換える)。2 時間前にログインした人はポリシー 2・30 秒前にログインした人はポリシー 3
-- (now() の番号にすると、ログインの時に見ていない版に同意したことになる)
update private.legal_revisions set effective_at = now() - interval '1 hour' where doc = 'privacy' and version = 3;
set local role authenticated;
select public.zz_claims('av-new2', interval '2 hours');
select lives_ok($$select public.complete_onboarding('newuser2')$$, 'V8: 2 時間前のログインでも通る');
select public.zz_claims('av-new3', interval '30 seconds');
select lives_ok($$select public.complete_onboarding('newuser3')$$, 'V8: 30 秒前のログインでも通る');
set local role postgres;
select is(
  (select agreed_terms_version || ':' || agreed_privacy_version from public.user_agreements where user_id = 'av-new2'),
  '1:2', 'V8: 改定の適用(1 時間前)より前にログインした人は、ログインの時の番号(1・2)'
);
select is(
  (select agreed_terms_version || ':' || agreed_privacy_version from public.user_agreements where user_id = 'av-new3'),
  '1:3', 'V8: 適用の後にログインした人は、今の番号(1・3)'
);
select ok(
  has_function_privilege('authenticated', 'public.complete_onboarding(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.complete_onboarding(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.complete_onboarding(text)', 'EXECUTE'),
  'V8: complete_onboarding の EXECUTE は authenticated だけのまま'
);

-- ===== V8b: 同意前の行の番号と日時が、登録で user_agreements へそのまま写る =====
-- 記録の後に新しい改定(ポリシー 3)が適用されても、auth_time の番号(3)でなく、同意前の行の番号(2)と日時が入る
insert into private.pending_registrations (sub, agreed_terms_version, agreed_privacy_version, version_agreed_at)
values ('av-copy', 1, 2, now() - interval '3 hours');
set local role authenticated;
select public.zz_claims('av-copy', interval '10 seconds');
select lives_ok($$select public.complete_onboarding('copyuser')$$, 'V8b: 同意前の行に番号のある人の登録が通る');
set local role postgres;
select is(
  (select agreed_terms_version || ':' || agreed_privacy_version || ':' || (version_agreed_at < now() - interval '2 hours')::text from public.user_agreements where user_id = 'av-copy'),
  '1:2:true', 'V8b: 同意前の行の番号と version_agreed_at が user_agreements へ写る(auth_time の番号 3 でない)'
);
select is((select count(*)::int from private.pending_registrations where sub = 'av-copy'), 0, 'V8b: 同意前の行は登録で消える');

-- 番号が引けない時(一覧が空)は、3 列とも null で登録は通す
create temp table zz_saved on commit drop as select * from private.legal_revisions;
delete from private.legal_revisions;
insert into private.pending_registrations (sub) values ('av-empty');
set local role authenticated;
select public.zz_claims('av-empty');
select lives_ok($$select public.complete_onboarding('emptyuser')$$, 'V8: 一覧が空でも登録は通る');
set local role postgres;
select is(
  (select agreed_terms_version is null and agreed_privacy_version is null and version_agreed_at is null from public.user_agreements where user_id = 'av-empty'),
  true, 'V8: 番号が引けない時は 3 列とも null');
insert into private.legal_revisions select * from zz_saved;

-- ===== V9: 削除(公開済みの 3 関数のまま)で番号の入った行が消え、削除の後の記録は行を作らない =====
set local role postgres;
insert into public.profiles (id, username) values ('av-wd', 'wd');
insert into public.user_agreements (user_id, agreed_terms_version, agreed_privacy_version, version_agreed_at) values ('av-wd', 1, 3, now());
set local role authenticated;
select public.zz_claims('av-wd');
select public.begin_withdrawal();
select public.finish_withdrawal();
set local role postgres;
select is((select count(*)::int from public.user_agreements where user_id = 'av-wd'), 0, 'V9: finish_withdrawal で番号の入った user_agreements の行が消える');
set local role authenticated;
select public.zz_claims('av-wd');
select throws_ok($$select public.record_agreement()$$, 'P0001', 'not authenticated', 'V9: 退会の後の record_agreement は拒否で、行を作らない');
set local role postgres;
select is((select count(*)::int from public.user_agreements where user_id = 'av-wd'), 0, 'V9: 退会の後も user_agreements の行は 0');

insert into public.profiles (id, username) values ('av-wc', 'wc');
insert into public.user_agreements (user_id, agreed_terms_version, agreed_privacy_version, version_agreed_at) values ('av-wc', 1, 3, now());
insert into private.withdrawal_marks (sub) values ('av-wc');
select private.withdrawal_confirm('av-wc');
select is((select count(*)::int from public.user_agreements where user_id = 'av-wc'), 0, 'V9: withdrawal_confirm で番号の入った user_agreements の行が消える');

insert into private.pending_registrations (sub, created_at, claimed_at) values ('av-pc', now() - interval '25 hours', now());
select is(private.pending_confirm('av-pc'), true, 'V9: pending_confirm が通る');
select is((select count(*)::int from private.pending_registrations where sub = 'av-pc'), 0, 'V9: 削除の後は同意前の行も無い');
set local role authenticated;
select public.zz_claims('av-pc');
select throws_ok($$select public.record_agreement()$$, 'P0001', 'not authenticated', 'V9: 削除の後の record_agreement は拒否(削除が利用者単位の失効を書く)');
set local role postgres;
select is(
  (select count(*)::int from private.pending_registrations where sub = 'av-pc') + (select count(*)::int from public.user_agreements where user_id = 'av-pc'),
  0, 'V9: 削除の後の record_agreement は、どちらの表にも行を作らない'
);

-- ===== V9b: 番号の入った同意前の行が削除で消える =====
insert into private.pending_registrations (sub, agreed_terms_version, agreed_privacy_version, version_agreed_at, created_at, claimed_at)
values ('av-pn', 1, 2, now(), now() - interval '25 hours', now());
select is(private.pending_confirm('av-pn'), true, 'V9b: 番号の入った同意前の行で pending_confirm が通る');
select is((select count(*)::int from private.pending_registrations where sub = 'av-pn'), 0, 'V9b: 番号の入った同意前の行が pending_confirm で消える');
insert into public.profiles (id, username) values ('av-wf', 'wf');
insert into private.pending_registrations (sub, agreed_terms_version, agreed_privacy_version, version_agreed_at) values ('av-wf', 1, 2, now());
set local role authenticated;
select public.zz_claims('av-wf');
select public.begin_withdrawal();
select public.finish_withdrawal();
set local role postgres;
select is((select count(*)::int from private.pending_registrations where sub = 'av-wf'), 0, 'V9b: 番号の入った同意前の行が finish_withdrawal で消える');

-- ===== V10: 旧い record_agreement の上限(25 本目。文をビルドに持たない 4 回目の改定へ、旧いクライアントが同意を記録しない) =====
-- この時点で、ポリシー 3(適用済み・notice・builtin_text 真)が今の番号。4 回目(builtin_text 偽)と規約 2(notice なし)を適用済みで足す。
insert into private.legal_revisions (doc, version, revised_on, effective_at, notice, builtin_text, notice_ja, notice_en)
values ('privacy', 4, date '2026-11-29', now() - interval '30 minutes', true, false, array['ja'], array['en']);
insert into private.legal_revisions (doc, version, revised_on, effective_at, notice)
values ('terms', 2, date '2026-11-29', now() - interval '30 minutes', false);
insert into public.profiles (id, username) values ('av-n0', 'n0'), ('av-n2', 'n2'), ('av-n3', 'n3'), ('av-n4', 'n4');
insert into public.user_agreements (user_id) values ('av-n0');
insert into public.user_agreements (user_id, agreed_terms_version, agreed_privacy_version, version_agreed_at)
values ('av-n2', 1, 2, now()), ('av-n3', 1, 3, now()), ('av-n4', 2, 4, now());
insert into private.pending_registrations (sub) values ('av-n5');
set local role authenticated;
select public.zz_claims('av-n0');
select is(public.record_agreement(), 'recorded', 'V10: 番号なしの人の旧い記録は recorded');
set local role postgres;
select is(
  (select agreed_terms_version || ':' || agreed_privacy_version from public.user_agreements where user_id = 'av-n0'),
  '2:3', 'V10: 番号なしの人の旧い記録は、ポリシーを 3 で止める(4 回目に旧いクライアントは同意しない)。上限の無い規約は今の番号 2');
set local role authenticated;
select public.zz_claims('av-n0');
select is(public.record_agreement(), 'recorded', 'V10: 番号なしの人の 2 回目の旧い記録は、3 を越えて 4 を書く');
set local role postgres;
select is(
  (select agreed_terms_version || ':' || agreed_privacy_version from public.user_agreements where user_id = 'av-n0'),
  '2:4', 'V10: 2 回目で 4');
set local role authenticated;
select public.zz_claims('av-n0');
select is(public.record_agreement(), 'already', 'V10: 3 回目は already');
select public.zz_claims('av-n2');
select is(public.record_agreement(), 'recorded', 'V10: 番号 2 の人の旧い記録は recorded');
set local role postgres;
select is(
  (select agreed_terms_version || ':' || agreed_privacy_version from public.user_agreements where user_id = 'av-n2'),
  '2:3', 'V10: 番号 2 の人の旧い記録は 3 で止まる(規約は上限が無く今の番号 2)');
set local role authenticated;
select public.zz_claims('av-n3');
select is(public.record_agreement(), 'recorded', 'V10: 番号 3 の人の旧い記録は recorded');
set local role postgres;
select is(
  (select agreed_terms_version || ':' || agreed_privacy_version from public.user_agreements where user_id = 'av-n3'),
  '2:4', 'V10: 番号 3 の人の旧い記録は 4(3 回目に同意済みの人は、2.0.0 のログインで 4 回目が記録されても正しい)');
set local role authenticated;
select public.zz_claims('av-n4');
select is(public.record_agreement(), 'already', 'V10: 4 に同意済みの人は already');
select public.zz_claims('av-n5');
select is(public.record_agreement(), 'recorded', 'V10: 登録の前(同意前の行)の人の旧い記録は recorded');
set local role postgres;
select is(
  (select agreed_terms_version || ':' || agreed_privacy_version from private.pending_registrations where sub = 'av-n5'),
  '2:4', 'V10: 登録の前の人は今の番号(2・4)を書く');
select is((select count(*)::int from public.user_agreements where user_id = 'av-n5'), 0, 'V10: 登録の前の記録は user_agreements に行を作らない');

select * from finish();
rollback;
