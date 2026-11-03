-- login-replace: 退会と中止(LR-D8・begin_withdrawal と finish_withdrawal)/ 同意前の表と 2 つの役割(LR-D9)/ 関数の守り(LR-D10)/ 旧い仕組みの撤去(LR-D12)/
-- 課金と secret の経路(LR-D13)の検証。LR-D7(登録の完了)は 06_complete_onboarding.sql が持つ。
-- 2 つの LOGIN の役割は、権限を has_*_privilege で見る(役割に切り替えて呼ぶのは pgTAP の関数の権限を巻き込むため避け、
-- 関数は所有者の postgres として呼ぶ。SECURITY DEFINER なので結果は同じ)。
begin;
select plan(90);

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

-- ===== LR-D8: 退会と中止(begin_withdrawal → finish_withdrawal・改訂 5) =====
-- 検査の利用者: a = 退会する(profiles あり)/ b = 他人(不変)/ c = 6 分前(拒否)/ d = 4 分前(通る)/ e = 同意前の中止。
insert into public.profiles (id, username) values ('lr-d8-a', 'a'), ('lr-d8-b', 'b');
insert into public.user_agreements (user_id) values ('lr-d8-a'), ('lr-d8-b');
insert into public.saved_places (user_id, place_id, status) values
  ('lr-d8-a', 'a0000000-0000-0000-0000-000000000001', 'want_to_go'),
  ('lr-d8-b', 'a0000000-0000-0000-0000-000000000001', 'want_to_go');
insert into public.ogp_fetch_attempts (user_id, url_hash) values ('lr-d8-a', repeat('a', 64)), ('lr-d8-b', repeat('a', 64));
insert into private.pending_registrations (sub) values ('lr-d8-a');
insert into private.login_revocations (sub, auth_time) values ('lr-d8-a', 1);

select hasnt_function('public', 'delete_my_account', '{}'::name[], 'D8: public.delete_my_account は無い');

-- ---- a: profiles あり・auth_time 1 分前 → 印と利用者単位の失効の行ができる ----
set local role authenticated;
select public.zz_claims('lr-d8-a');
select is(public.begin_withdrawal(), 'marked', 'D8: profiles のある sub が auth_time 1 分前で begin_withdrawal → marked');

set local role postgres;
select is(
  (select count(*)::int from private.withdrawal_marks where sub = 'lr-d8-a'),
  1, 'D8: 退会の印の行ができる'
);
select is(
  (select not_before from private.user_revocations where sub = 'lr-d8-a'),
  now(), 'D8: 利用者単位の失効の行ができ、not_before は印の時刻'
);
select is(
  ((select count(*) from public.profiles where id = 'lr-d8-a')
   + (select count(*) from public.user_agreements where user_id = 'lr-d8-a')
   + (select count(*) from public.saved_places where user_id = 'lr-d8-a')
   + (select count(*) from public.ogp_fetch_attempts where user_id = 'lr-d8-a')
   + (select count(*) from private.pending_registrations where sub = 'lr-d8-a')
   + (select count(*) from private.login_revocations where sub = 'lr-d8-a'))::int,
  6, 'D8: begin_withdrawal は行を消さない(消すのは finish_withdrawal と毎時の削除)'
);

-- ---- 印の直後から、その sub のどのトークンも偽(印の後に新しくログインしたものも) ----
set local role authenticated;
select public.zz_claims('lr-d8-a');
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D8: 印の直後、同じトークンは判定が偽・表は 0 行'
);
-- auth_time を未来(-1 時間)にして、利用者単位の失効の not_before より後にする = 失効では止まらず、印だけが効く形。
select public.zz_claims('lr-d8-a', interval '-1 hour');
select ok(
  not public.session_is_valid() and (select count(*) from public.profiles) = 0,
  'D8: 印の後に新しくログインしたトークン(auth_time が失効の not_before より後)も偽・表は 0 行'
);
select public.zz_claims('lr-d8-b', interval '-1 hour');
select ok(
  public.session_is_valid() and (select count(*) from public.profiles) = 1,
  'D8: 対照: 印の無い b の同じ形のトークンは通る(上の偽は印による)'
);

-- ---- 印のある sub の 2 回目の begin_withdrawal → 『済み』で行は増えない(session_ok が偽でも通る) ----
select public.zz_claims('lr-d8-a', interval '-1 hour');
select is(public.begin_withdrawal(), 'already_marked', 'D8: 印のある sub の 2 回目の begin_withdrawal → already_marked');
set local role postgres;
select is(
  ((select count(*) from private.withdrawal_marks where sub = 'lr-d8-a')
   + (select count(*) from private.user_revocations where sub = 'lr-d8-a'))::int,
  2, 'D8: 2 回目で印と利用者単位の失効の行は増えない'
);

-- ---- 印の後は、新しい行も完了もできない ----
set local role authenticated;
select public.zz_claims('lr-d8-a', interval '-1 hour');
select throws_ok(
  $$select public.complete_onboarding('再作成')$$,
  'P0001', 'not authenticated', 'D8: 印の後、同じ sub で complete_onboarding は拒否される(行を作り直せない)'
);
select throws_ok(
  $$insert into public.saved_places (user_id, place_id, status)
    values ('lr-d8-a', 'a0000000-0000-0000-0000-000000000002', 'want_to_go')$$,
  '42501', null, 'D8: 印の後、同じ sub で saved_places に行を作れない'
);

-- ---- finish_withdrawal:印のある sub の本人のトークンで、4 表と同意前の行とログイン単位の失効を消す ----
select lives_ok(
  $$select public.finish_withdrawal()$$,
  'D8: 印の後(有効なログインの判定は偽のまま)でも、本人のトークンで finish_withdrawal が成功する'
);
set local role postgres;
select is(
  ((select count(*) from public.profiles where id = 'lr-d8-a')
   + (select count(*) from public.user_agreements where user_id = 'lr-d8-a')
   + (select count(*) from public.saved_places where user_id = 'lr-d8-a')
   + (select count(*) from public.ogp_fetch_attempts where user_id = 'lr-d8-a')
   + (select count(*) from private.pending_registrations where sub = 'lr-d8-a')
   + (select count(*) from private.login_revocations where sub = 'lr-d8-a'))::int,
  0, 'D8: 4 表と同意前の行とログイン単位の失効の a の行が 0'
);
select is(
  ((select count(*) from private.withdrawal_marks where sub = 'lr-d8-a')
   + (select count(*) from private.user_revocations where sub = 'lr-d8-a'))::int,
  2, 'D8: 印と利用者単位の失効の行は残る(印は毎時の削除の確認で消える)'
);
select is(
  ((select count(*) from public.profiles where id = 'lr-d8-b')
   + (select count(*) from public.user_agreements where user_id = 'lr-d8-b')
   + (select count(*) from public.saved_places where user_id = 'lr-d8-b')
   + (select count(*) from public.ogp_fetch_attempts where user_id = 'lr-d8-b'))::int,
  4, 'D8: 他人(b)の行は不変'
);
set local role authenticated;
select public.zz_claims('lr-d8-a', interval '-1 hour');
select lives_ok($$select public.finish_withdrawal()$$, 'D8: 印が残る間、finish_withdrawal を繰り返しても成功する(冪等)');

-- ---- 印の無い sub の finish_withdrawal → 拒否・行は不変 ----
select public.zz_claims('lr-d8-b');
select throws_ok(
  $$select public.finish_withdrawal()$$,
  'P0001', 'no withdrawal mark', 'D8: 印の無い sub の finish_withdrawal は拒否される'
);
set local role postgres;
select is(
  ((select count(*) from public.profiles where id = 'lr-d8-b')
   + (select count(*) from public.user_agreements where user_id = 'lr-d8-b')
   + (select count(*) from public.saved_places where user_id = 'lr-d8-b')
   + (select count(*) from public.ogp_fetch_attempts where user_id = 'lr-d8-b'))::int,
  4, 'D8: 拒否された finish_withdrawal で b の行は不変'
);

-- ---- c: profiles あり・auth_time 6 分前 → begin_withdrawal は拒否・何も書かれない ----
insert into public.profiles (id, username) values ('lr-d8-c', 'c'), ('lr-d8-d', 'd');
set local role authenticated;
select public.zz_claims('lr-d8-c', interval '6 minutes');
select throws_ok(
  $$select public.begin_withdrawal()$$,
  'P0001', 'recent login required', 'D8: profiles のある sub の auth_time が 6 分前なら begin_withdrawal は拒否される'
);
set local role postgres;
select is(
  ((select count(*) from private.withdrawal_marks where sub = 'lr-d8-c')
   + (select count(*) from private.user_revocations where sub = 'lr-d8-c'))::int,
  0, 'D8: 拒否された begin_withdrawal は印も失効も書かない'
);
-- d: 4 分前(5 分以内)は通る
set local role authenticated;
select public.zz_claims('lr-d8-d', interval '4 minutes');
select is(public.begin_withdrawal(), 'marked', 'D8: profiles のある sub の auth_time が 4 分前なら begin_withdrawal は通る');

-- ---- e: 同意前(profiles なし)の中止 → auth_time が 1 時間前でも通る。印の後は complete_onboarding を拒む ----
set local role postgres;
insert into private.pending_registrations (sub) values ('lr-d8-e');
set local role authenticated;
select public.zz_claims('lr-d8-e', interval '1 hour');
select is(public.begin_withdrawal(), 'marked', 'D8: 同意前(profiles なし)の sub は auth_time が 1 時間前でも begin_withdrawal が通る');
select throws_ok(
  $$select public.complete_onboarding('中止の後')$$,
  'P0001', 'not authenticated', 'D8: 中止の印の後、同じ sub で complete_onboarding は拒否される'
);
select lives_ok($$select public.finish_withdrawal()$$, 'D8: 中止の finish_withdrawal が成功する');
set local role postgres;
select is(
  ((select count(*) from private.pending_registrations where sub = 'lr-d8-e')
   + (select count(*) from public.profiles where id = 'lr-d8-e'))::int,
  0, 'D8: 中止の後、同意前の行も profiles も無い'
);

-- ---- 出所の違うトークン・期限切れは begin / finish とも拒否 ----
set local role authenticated;
select public.zz_claims('lr-d8-b', interval '1 minute', '{"role":"anon"}'::jsonb);
select throws_ok($$select public.begin_withdrawal()$$, 'P0001', 'not authenticated', 'D8: role が anon なら begin_withdrawal は拒否される');
select throws_ok($$select public.finish_withdrawal()$$, 'P0001', 'not authenticated', 'D8: role が anon なら finish_withdrawal は拒否される');
select public.zz_claims('lr-d8-b', interval '1 minute', '{"iss":"https://securetoken.google.com/other-project"}'::jsonb);
select throws_ok($$select public.begin_withdrawal()$$, 'P0001', 'not authenticated', 'D8: iss が別の project なら begin_withdrawal は拒否される');
select throws_ok($$select public.finish_withdrawal()$$, 'P0001', 'not authenticated', 'D8: iss が別の project なら finish_withdrawal は拒否される');
select public.zz_claims('lr-d8-b', interval '1 minute', '{"aud":"other-project"}'::jsonb);
select throws_ok($$select public.begin_withdrawal()$$, 'P0001', 'not authenticated', 'D8: aud が別の project なら begin_withdrawal は拒否される');
select throws_ok($$select public.finish_withdrawal()$$, 'P0001', 'not authenticated', 'D8: aud が別の project なら finish_withdrawal は拒否される');
select public.zz_claims('lr-d8-b', interval '31 days');
select throws_ok($$select public.begin_withdrawal()$$, 'P0001', 'not authenticated', 'D8: 30 日を過ぎたログインでは(印が無ければ)begin_withdrawal は拒否される');
set local role postgres;
select is(
  (select count(*)::int from private.withdrawal_marks),
  3, 'D8: 拒否された呼び出しで印は増えない(a・d・e の 3 件だけ)'
);
select is(
  ((select count(*) from public.profiles where id = 'lr-d8-b')
   + (select count(*) from public.user_agreements where user_id = 'lr-d8-b')
   + (select count(*) from public.saved_places where user_id = 'lr-d8-b')
   + (select count(*) from public.ogp_fetch_attempts where user_id = 'lr-d8-b'))::int,
  4, 'D8: 最後まで他人(b)の行は不変'
);
-- D9 の fixture を独立させる(D8 の印は計画どおり finish_withdrawal の後も残るので、D9 の全集合の比較に混ざらないよう消す)
delete from private.withdrawal_marks where sub in ('lr-d8-a', 'lr-d8-d', 'lr-d8-e');

-- ===== LR-D9: 同意前の表と 2 つの役割 =====
set local role postgres;

select ok(
  (select count(*) from pg_roles where rolname in ('pending_registrar', 'pending_reaper') and rolcanlogin) = 2,
  'D9: pending_registrar と pending_reaper は LOGIN の役割として在る'
);
select ok(
  has_function_privilege('pending_registrar', 'private.pending_register(text)', 'EXECUTE')
  and not has_function_privilege('pending_registrar', 'private.pending_claim()', 'EXECUTE')
  and not has_function_privilege('pending_registrar', 'private.pending_confirm(text)', 'EXECUTE')
  and not has_function_privilege('pending_registrar', 'private.withdrawal_claim()', 'EXECUTE')
  and not has_function_privilege('pending_registrar', 'private.withdrawal_confirm(text)', 'EXECUTE'),
  'D9: pending_registrar は登録の関数だけを実行できる'
);
select ok(
  has_function_privilege('pending_reaper', 'private.pending_claim()', 'EXECUTE')
  and has_function_privilege('pending_reaper', 'private.pending_confirm(text)', 'EXECUTE')
  and has_function_privilege('pending_reaper', 'private.withdrawal_claim()', 'EXECUTE')
  and has_function_privilege('pending_reaper', 'private.withdrawal_confirm(text)', 'EXECUTE')
  and not has_function_privilege('pending_reaper', 'private.pending_register(text)', 'EXECUTE'),
  'D9: pending_reaper は取得と確認の 4 関数(同意前 2・退会の印 2)だけを実行できる'
);
select ok(
  not exists (
    select 1
      from (values
        ('private.pending_registrations'), ('private.auth_settings'), ('private.user_revocations'), ('private.login_revocations'), ('private.withdrawal_marks'),
        ('public.profiles'), ('public.user_agreements'), ('public.saved_places'), ('public.ogp_fetch_attempts'), ('public.places')
      ) t(tbl)
      cross join (values ('pending_registrar'), ('pending_reaper')) r(rolname)
     where has_table_privilege(r.rolname::name, t.tbl::text, 'SELECT')
        or has_table_privilege(r.rolname::name, t.tbl::text, 'INSERT')
        or has_table_privilege(r.rolname::name, t.tbl::text, 'UPDATE')
        or has_table_privilege(r.rolname::name, t.tbl::text, 'DELETE')
  ),
  'D9: 2 つの役割はどの表も直接読めず書けない'
);
select ok(
  not has_function_privilege('authenticated', 'private.pending_register(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.pending_claim()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.pending_confirm(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.withdrawal_claim()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.withdrawal_confirm(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.pending_register(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.pending_claim()', 'EXECUTE')
  and not has_function_privilege('anon', 'private.pending_confirm(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.withdrawal_claim()', 'EXECUTE')
  and not has_function_privilege('anon', 'private.withdrawal_confirm(text)', 'EXECUTE'),
  'D9: authenticated と anon は 5 つの関数(同意前 3・退会の印 2)を実行できない'
);

select ok(
  not has_function_privilege('anon', 'public.session_is_valid()', 'EXECUTE'),
  'D9: anon は session_is_valid を実行できない'
);

-- 登録
select lives_ok($$select private.pending_register('p-reg-1')$$, 'D9: pending_register が成功する');
select lives_ok($$select private.pending_register('p-reg-1')$$, 'D9: 同じ sub の 2 回目の登録も成功し、行は増えない');
select throws_ok($$select private.pending_register('')$$, 'P0001', 'invalid sub', 'D9: 空の sub は登録できない');
select throws_ok(
  format($$select private.pending_register(%L)$$, repeat('x', 129)),
  'P0001', 'invalid sub', 'D9: 129 文字の sub は登録できない'
);

-- 取得
insert into private.pending_registrations (sub, created_at, claimed_at) values
  ('p-old-noprofile', now() - interval '25 hours', null),
  ('p-old-profile',   now() - interval '25 hours', null),
  ('p-new',           now(),                       null),
  ('p-claimed-old',   now() - interval '30 hours', now() - interval '1 hour');
insert into public.profiles (id, username) values ('p-old-profile', 'has_profile');

select is(
  (select array_agg(c.sub order by c.sub) from private.pending_claim() c),
  array['p-claimed-old', 'p-old-noprofile']::text[],
  'D9: 取得は「24 時間を過ぎてプロフィールが無い」行だけを返す(24 時間未満・プロフィールありは返らない)'
);
select is(
  (select array_agg(c.sub order by c.sub) from private.pending_claim() c),
  array['p-claimed-old', 'p-old-noprofile']::text[],
  'D9: 印あり・未確認の行は、次の取得でも再び返る(確認が来るまで消えない)'
);
select is(
  (select count(*)::int from private.pending_registrations
    where claimed_at is not null and sub in ('p-old-noprofile', 'p-claimed-old')),
  2, 'D9: 取得した行に削除中の印が付く'
);
select is(
  (select count(*)::int from private.pending_registrations
    where claimed_at is null and sub in ('p-new', 'p-old-profile', 'p-reg-1')),
  3, 'D9: 取得されなかった行には印が付かない'
);
select ok(
  (select claimed_at from private.pending_registrations where sub = 'p-claimed-old') = now() - interval '1 hour',
  'D9: 既に付いていた印の時刻は取得で書き換わらない'
);

-- 取得の後に、その sub で complete_onboarding → 拒否
set local role authenticated;
select public.zz_claims('p-old-noprofile');
select throws_ok(
  $$select public.complete_onboarding('取得の後')$$,
  'P0001', 'pending registration is being removed', 'D9: 取得の後の complete_onboarding は拒否される'
);
select throws_ok(
  $$insert into public.profiles (id, username) values ('p-old-noprofile', 'direct')$$,
  '42501', null, 'D9: 取得の後、その sub のトークンで profiles を直接 INSERT しても拒否される(改訂 6)'
);
select throws_ok(
  $$insert into public.user_agreements (user_id) values ('p-old-noprofile')$$,
  '42501', null, 'D9: 取得の後、その sub のトークンで user_agreements を直接 INSERT しても拒否される(改訂 6)'
);
set local role postgres;
select is(
  (select count(*)::int from public.profiles where id = 'p-old-noprofile')
  + (select count(*)::int from public.user_agreements where user_id = 'p-old-noprofile'),
  0, 'D9: 拒否された完了と直接 INSERT で行は増えない'
);

-- 確認が false を返す組:行数と中身が呼ぶ前と同じ
insert into private.pending_registrations (sub, claimed_at) values ('p-marked-profile', now());
insert into public.profiles (id, username) values ('p-marked-profile', 'done');
create temp view v_fp as
select md5(concat_ws('|',
  (select count(*) from public.profiles)::text,
  (select count(*) from public.user_agreements)::text,
  (select count(*) from public.saved_places)::text,
  (select count(*) from public.ogp_fetch_attempts)::text,
  (select coalesce(string_agg(p.sub || ':' || coalesce(p.claimed_at::text, '-'), ',' order by p.sub), '') from private.pending_registrations p),
  (select coalesce(string_agg(r.sub || ':' || r.not_before::text, ',' order by r.sub), '') from private.user_revocations r),
  (select coalesce(string_agg(l.sub || ':' || l.auth_time::text, ',' order by l.sub, l.auth_time), '') from private.login_revocations l),
  (select coalesce(string_agg(m.sub || ':' || m.created_at::text, ',' order by m.sub), '') from private.withdrawal_marks m)
)) as fp;
create temp table snap_before as select fp from v_fp;

select is(private.pending_confirm('p-new'), false, 'D9: 印の無い同意前の行(24 時間未満で取得に返っていない)は確認しても false');
select is(private.pending_confirm('p-marked-profile'), false, 'D9: 印があり profiles にも行がある sub は false');
select is(private.pending_confirm('11111111-1111-1111-1111-111111111111'), false, 'D9: 同意前の行が無く profiles のある完了済みの利用者は false');
select is(private.pending_confirm('no-such-sub'), false, 'D9: どの表にも無い sub は false');
select is((select fp from v_fp), (select fp from snap_before), 'D9: false の確認は 4 表・同意前の表・失効の表を 1 行も変えない');

-- 確認が true になる組
insert into public.saved_places (user_id, place_id, status) values ('p-old-noprofile', 'a0000000-0000-0000-0000-000000000001', 'want_to_go');
insert into public.ogp_fetch_attempts (user_id, url_hash) values ('p-old-noprofile', repeat('b', 64));
insert into private.login_revocations (sub, auth_time) values ('p-old-noprofile', 1);
select is(private.pending_confirm('p-old-noprofile'), true, 'D9: 印があり profiles の無い sub の確認は true');
select is(
  ((select count(*) from public.profiles where id = 'p-old-noprofile')
   + (select count(*) from public.user_agreements where user_id = 'p-old-noprofile')
   + (select count(*) from public.saved_places where user_id = 'p-old-noprofile')
   + (select count(*) from public.ogp_fetch_attempts where user_id = 'p-old-noprofile')
   + (select count(*) from private.pending_registrations where sub = 'p-old-noprofile')
   + (select count(*) from private.login_revocations where sub = 'p-old-noprofile'))::int,
  0, 'D9: 確認の後、その sub の 4 表と同意前の行は 0'
);
select is(
  (select not_before from private.user_revocations where sub = 'p-old-noprofile'),
  now(), 'D9: 確認の後、その sub の利用者単位の失効の行がある'
);
set local role authenticated;
select public.zz_claims('p-old-noprofile');
select throws_ok(
  $$select public.complete_onboarding('確認の後')$$,
  'P0001', 'not authenticated', 'D9: 確認の後、同じ sub の期限内のトークンでも complete_onboarding は拒否される'
);
set local role postgres;
select is(
  (select array_agg(c.sub order by c.sub) from private.pending_claim() c),
  array['p-claimed-old']::text[],
  'D9: 確認で消えた行は、次の取得に返らない'
);

-- ===== LR-D9(改訂 5): 退会の印の取得(withdrawal_claim)と確認(withdrawal_confirm) =====
-- w-1 = 印あり・profiles あり(finish_withdrawal が途中で止まった組)/ w-noprofile = 印あり・profiles なし / w-2 = 印なし・profiles あり。
insert into public.profiles (id, username) values ('w-1', 'w1'), ('w-2', 'w2');
insert into public.user_agreements (user_id) values ('w-1');
insert into public.saved_places (user_id, place_id, status) values ('w-1', 'a0000000-0000-0000-0000-000000000001', 'want_to_go');
insert into public.ogp_fetch_attempts (user_id, url_hash) values ('w-1', repeat('f', 64));
insert into private.pending_registrations (sub) values ('w-1');
insert into private.login_revocations (sub, auth_time) values ('w-1', 1);
insert into private.withdrawal_marks (sub) values ('w-1'), ('w-noprofile');
create temp table snap_claim as select fp from v_fp;

select is(
  (select array_agg(c.sub order by c.sub) from private.withdrawal_claim() c),
  array['w-1', 'w-noprofile']::text[],
  'D9: withdrawal_claim は印のある sub を返す(時刻の閾値なし)'
);
select is(
  (select array_agg(c.sub order by c.sub) from private.withdrawal_claim() c),
  array['w-1', 'w-noprofile']::text[],
  'D9: 印あり・未確認の sub は、次の取得でも再び返る(確認が来るまで消えない)'
);
select is((select fp from v_fp), (select fp from snap_claim), 'D9: withdrawal_claim は何も書き換えない');

-- 印の後・確認の前のトークンは偽
set local role authenticated;
select public.zz_claims('w-1', interval '1 minute');
select ok(not public.session_is_valid(), 'D9: 印の後・確認の前の auth_time のトークンは判定が偽');
set local role postgres;

-- 確認が false を返す組:印の無い sub は何も変えない
select is(private.withdrawal_confirm('w-2'), false, 'D9: 印の無い sub(profiles のある別の利用者)の withdrawal_confirm は false');
select is(private.withdrawal_confirm('no-such-sub'), false, 'D9: どの表にも無い sub の withdrawal_confirm は false');
select is(private.withdrawal_confirm(''), false, 'D9: 空の sub の withdrawal_confirm は false');
select is((select fp from v_fp), (select fp from snap_claim), 'D9: false の withdrawal_confirm は 4 表・同意前の表・失効の表・印の表を 1 行も変えない');

-- 確認が true になる組
select is(private.withdrawal_confirm('w-1'), true, 'D9: 印のある sub の withdrawal_confirm は true');
select is(
  ((select count(*) from public.profiles where id = 'w-1')
   + (select count(*) from public.user_agreements where user_id = 'w-1')
   + (select count(*) from public.saved_places where user_id = 'w-1')
   + (select count(*) from public.ogp_fetch_attempts where user_id = 'w-1')
   + (select count(*) from private.pending_registrations where sub = 'w-1')
   + (select count(*) from private.login_revocations where sub = 'w-1')
   + (select count(*) from private.withdrawal_marks where sub = 'w-1'))::int,
  0, 'D9: 確認の後、その sub の 4 表・同意前の行・ログイン単位の失効・印が 0'
);
select ok(
  (select not_before from private.user_revocations where sub = 'w-1') >= now(),
  'D9: 確認の後、利用者単位の失効の not_before が確認の時刻以上'
);
select is(
  (select count(*)::int from public.profiles where id = 'w-2'),
  1, 'D9: 確認は他の sub(w-2)の行に触れない'
);
set local role authenticated;
select public.zz_claims('w-1', interval '1 minute');
select ok(not public.session_is_valid(), 'D9: 印の後・確認の前の auth_time のトークンは、確認の後も判定が偽');
set local role postgres;
select is(
  (select array_agg(c.sub order by c.sub) from private.withdrawal_claim() c),
  array['w-noprofile']::text[],
  'D9: 確認で消えた印は、次の取得に返らない'
);
select is(private.withdrawal_confirm('w-noprofile'), true, 'D9: profiles の無い sub の印も確認できる');

-- ===== LR-D10: 関数の守りと private の表 =====
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname in ('public', 'private')
    where p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')),
  0, 'D10: SECURITY DEFINER の関数は全て search_path を固定している'
);
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname in ('public', 'private')
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
    where p.prosecdef and a.grantee = 0),
  0, 'D10: SECURITY DEFINER の関数は全て public の execute を revoke している'
);
select is(
  (select count(*)::int
     from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'private'
    where c.relkind = 'r' and not c.relrowsecurity),
  0, 'D10: private の表は全て RLS が有効'
);
select is(
  (select count(*)::int
     from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'private'
     cross join lateral aclexplode(coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
    where c.relkind = 'r'
      and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role', 'pending_registrar', 'pending_reaper'))),
  0, 'D10: private の表に anon / authenticated / service_role / 2 つの役割 / PUBLIC の権限が無い'
);

-- ===== LR-D12: 旧い仕組みの撤去 =====
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.prosrc ~ 'auth\.(uid|users)'),
  0, 'D12: public の関数の本体に auth.users・auth.uid の参照が無い'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\.(uid|users)'),
  0, 'D12: public の policy に auth.users・auth.uid の参照が無い'
);

-- ===== LR-D13: 課金と secret の経路(OGP の抑制) =====
select public.zz_claims('lr-d13');
set local role authenticated;
select public.zz_claims('lr-d13');
select is(
  (select allowed from public.claim_ogp_fetch(repeat('c', 64))),
  true, 'D13: 有効なログインの claim_ogp_fetch は通る'
);
select lives_ok(
  $$select public.complete_ogp_fetch(repeat('c', 64), 'タイトル')$$,
  'D13: 有効なログインの complete_ogp_fetch は通る'
);
select public.zz_claims('lr-d13', interval '31 days');
select throws_ok(
  $$select * from public.claim_ogp_fetch(repeat('d', 64))$$,
  'P0001', 'not authenticated', 'D13: 期限切れのログインの claim_ogp_fetch は拒否される'
);
select throws_ok(
  $$select public.complete_ogp_fetch(repeat('c', 64), 'x')$$,
  'P0001', 'not authenticated', 'D13: 期限切れのログインの complete_ogp_fetch は拒否される'
);
set local role postgres;
insert into private.user_revocations (sub, not_before) values ('lr-d13', now());
set local role authenticated;
select public.zz_claims('lr-d13');
select throws_ok(
  $$select * from public.claim_ogp_fetch(repeat('e', 64))$$,
  'P0001', 'not authenticated', 'D13: 失効したログインの claim_ogp_fetch は拒否される'
);

set local role postgres;
select * from finish();
rollback;
