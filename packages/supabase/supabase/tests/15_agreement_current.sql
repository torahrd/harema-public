-- consent-version(再提示の画面・時刻の門): public.current_agreement()・record_agreement の時刻の門・お知らせの判定
-- (改定の一覧・列・記録・登録・削除は 14_agreement_versions.sql)
begin;
select plan(40);

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

-- 時刻によらない形にする: 本物のポリシー 3(適用 2026-11-22 0 時 JST・notice 真)の適用の日時をまたいで走らせても結果が変わらないよう、
-- 以後の節は「ポリシー 3 は先の改定」を前提にする。適用の日時を遠い先へ置く(C5 で、notice でない改定へ置き換えて適用の前後を試す)。
update private.legal_revisions set effective_at = now() + interval '10 years' where doc = 'privacy' and version = 3;

-- ===== C1: 権限と形 =====
select ok(
  has_function_privilege('authenticated', 'public.current_agreement()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.current_agreement()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.current_agreement()', 'EXECUTE'),
  'C1: current_agreement は authenticated だけが実行できる'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.current_agreement()'::regprocedure),
  'C1: current_agreement は security definer・search_path 固定'
);
set local role authenticated;
select public.zz_claims('cc-none');
select is((select count(*)::int from public.current_agreement()), 1, 'C1: 必ず 1 行(行の無い人にも)');

-- ===== C2: どちらの行も無い人 =====
select is((select agreed from public.current_agreement()), false, 'C2: どちらの行も無い人は agreed 偽');
select is((select notice_due from public.current_agreement()), false, 'C2: どちらの行も無い人は notice_due 偽');

-- ===== C2b: 同意前の行の人(登録の前) =====
set local role postgres;
insert into private.pending_registrations (sub) values ('cc-pend');
set local role authenticated;
select public.zz_claims('cc-pend');
select is((select agreed from public.current_agreement()), false, 'C2b: 同意前の行の人は、番号が null なら agreed 偽');
select is((select notice_due from public.current_agreement()), false, 'C2b: 同意前の行の人は、番号が null でも notice_due 偽(登録の画面の上に出さない)');
select is(public.record_agreement(), 'recorded', 'C2b: 同意前の行の人は recorded');
select is((select agreed from public.current_agreement()), true, 'C2b: 記録の後は agreed 真');
select is((select notice_due from public.current_agreement()), false, 'C2b: 記録の後も notice_due 偽');
set local role postgres;
-- 古い番号(規約 1・ポリシー 1)の同意前の行は agreed 偽・notice_due は偽のまま
insert into private.pending_registrations (sub, agreed_terms_version, agreed_privacy_version, version_agreed_at) values ('cc-pend-old', 1, 1, now());
set local role authenticated;
select public.zz_claims('cc-pend-old');
select is((select agreed from public.current_agreement()), false, 'C2b: 古い番号の同意前の行は agreed 偽');
select is((select notice_due from public.current_agreement()), false, 'C2b: 古い番号の同意前の行でも notice_due 偽');

-- ===== C3: 番号なしの user_agreements の行(既存の人) =====
set local role postgres;
insert into public.profiles (id, username) values ('cc-old', 'cold'), ('cc-v1', 'cv1'), ('cc-v2', 'cv2');
insert into public.user_agreements (user_id) values ('cc-old');
insert into public.user_agreements (user_id, agreed_terms_version, agreed_privacy_version, version_agreed_at) values ('cc-v1', 1, 1, now()), ('cc-v2', 1, 2, now());
-- ポリシー 2 の適用の前(now() は固定できないので、適用の日時を now() の後ろへ動かして試す)
update private.legal_revisions set effective_at = now() + interval '1 day' where doc = 'privacy' and version = 2;
set local role authenticated;
select public.zz_claims('cc-old');
select is((select agreed from public.current_agreement()), false, 'C3: 番号なしの行は agreed 偽(null は 0 の扱い)');
select is((select notice_due from public.current_agreement()), false, 'C3: notice の改定の適用の前は notice_due 偽');
select public.zz_claims('cc-v1');
select is((select agreed from public.current_agreement()), true, 'C3: 適用の前は、ポリシー 1 に同意した行は agreed 真');
set local role postgres;
update private.legal_revisions set effective_at = now() - interval '1 minute' where doc = 'privacy' and version = 2;
set local role authenticated;
select public.zz_claims('cc-old');
select is((select agreed from public.current_agreement()), false, 'C3: 適用の後も番号なしの行は agreed 偽');
select is((select notice_due from public.current_agreement()), true, 'C3: notice の改定の適用の後は、番号なしの行に notice_due 真');
select public.zz_claims('cc-v1');
select is((select agreed from public.current_agreement()), false, 'C3: 適用の後は、ポリシー 1 の行は agreed 偽');
select is((select notice_due from public.current_agreement()), true, 'C3: 適用の後は、ポリシー 1 の行に notice_due 真');
select public.zz_claims('cc-v2');
select is((select agreed from public.current_agreement()), true, 'C3: ポリシー 2 に同意した行は agreed 真');
select is((select notice_due from public.current_agreement()), false, 'C3: ポリシー 2 に同意した行は notice_due 偽');

-- ===== C4: 記録の後 =====
select public.zz_claims('cc-old');
select is(public.record_agreement(), 'recorded', 'C4: 記録で recorded');
select is((select agreed from public.current_agreement()), true, 'C4: 記録の後は agreed 真');
select is((select notice_due from public.current_agreement()), false, 'C4: 記録の後は notice_due 偽');

-- ===== C5: 時刻の門(先の改定は適用の前は今の番号にならない) =====
set local role postgres;
-- 本物のポリシー 3(notice 真)を、この節の話(notice でない先の改定)に置き換える: notice 偽・適用は 1 日後
update private.legal_revisions set notice = false, effective_at = now() + interval '1 day' where doc = 'privacy' and version = 3;
set local role authenticated;
select public.zz_claims('cc-old');
select is(public.record_agreement(), 'already', 'C5: 適用の前の改定は記録されない(already のまま)');
select is((select agreed from public.current_agreement()), true, 'C5: 適用の前は agreed 真のまま');
set local role postgres;
select is((select agreed_privacy_version from public.user_agreements where user_id = 'cc-old'), 2, 'C5: 適用の前は、番号は 2 のまま');
update private.legal_revisions set effective_at = now() - interval '1 hour' where doc = 'privacy' and version = 3;
set local role authenticated;
select public.zz_claims('cc-old');
select is((select agreed from public.current_agreement()), false, 'C5: 適用の後は agreed 偽');
select is((select notice_due from public.current_agreement()), false, 'C5: notice でない改定は、既に notice を見た人にお知らせを出さない');
select is(public.record_agreement(), 'recorded', 'C5: 適用の後は recorded');
set local role postgres;
select is((select agreed_privacy_version from public.user_agreements where user_id = 'cc-old'), 3, 'C5: 番号は 3');

-- ===== C6: notice の改定の後に notice でない改定が続いても、前者を見ていない人には notice_due 真 =====
-- (この時点: ポリシー 2 = notice 真・ポリシー 3 = notice 偽。cc-v1 はポリシー 1・cc-v2 はポリシー 2)
set local role authenticated;
select public.zz_claims('cc-v1');
select is((select notice_due from public.current_agreement()), true, 'C6: ポリシー 1 の人は、ポリシー 2(notice)を見ていないので notice_due 真');
select public.zz_claims('cc-v2');
select is((select notice_due from public.current_agreement()), false, 'C6: ポリシー 2 の人は、ポリシー 3(notice でない)だけなので notice_due 偽');

-- ===== C7: 拒否 =====
select public.zz_claims('cc-v1', interval '31 days');
select throws_ok($$select * from public.current_agreement()$$, 'P0001', 'not authenticated', 'C7: 30 日を過ぎたログインは拒否');
set local role anon;
select throws_ok($$select * from public.current_agreement()$$, '42501', null, 'C7: anon は実行できない');
set local role postgres;

-- ===== C8: 適用の日時の境目(effective_at <= now()) =====
update private.legal_revisions set effective_at = now() where doc = 'privacy' and version = 3;
insert into public.profiles (id, username) values ('cc-edge', 'cedge');
insert into public.user_agreements (user_id, agreed_terms_version, agreed_privacy_version, version_agreed_at) values ('cc-edge', 1, 2, now());
set local role authenticated;
select public.zz_claims('cc-edge');
select is((select agreed from public.current_agreement()), false, 'C8: effective_at が now() ちょうどなら今の番号(agreed 偽)');
set local role postgres;
update private.legal_revisions set effective_at = now() + interval '1 second' where doc = 'privacy' and version = 3;
set local role authenticated;
select is((select agreed from public.current_agreement()), true, 'C8: effective_at が now() の 1 秒後なら、まだ今の番号ではない(agreed 真)');
set local role postgres;

-- ===== C9: 一覧が空なら(今の番号が無い) =====
create temp table zz_saved on commit drop as select * from private.legal_revisions;
delete from private.legal_revisions;
set local role authenticated;
select public.zz_claims('cc-v2');
select is((select agreed from public.current_agreement()), false, 'C9: 一覧が空なら agreed 偽(今の番号が無い)');
select is((select notice_due from public.current_agreement()), false, 'C9: 一覧が空なら notice_due 偽');
select throws_ok($$select public.record_agreement()$$, 'P0001', 'no revision in effect', 'C9: 一覧が空なら record_agreement は no revision in effect');
set local role postgres;
insert into private.legal_revisions select * from zz_saved;

select * from finish();
rollback;
