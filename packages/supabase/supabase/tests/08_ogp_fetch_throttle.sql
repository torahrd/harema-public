-- 出典 OGP 取得の抑制(20260806000001)の構造・権限・挙動を検証。
-- 台帳 ogp_fetch_attempts は GRANT を持たず、claim_ogp_fetch / complete_ogp_fetch 経由でしか触れない。
-- 挙動は seed の u1 として authenticated で呼び、時刻は台帳を直接ずらして進める(rollback で消える)。
begin;
select plan(46);

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

-- ===== 構造 =====
select has_table('public', 'ogp_fetch_attempts', 'ogp_fetch_attempts テーブルが存在する');
select col_is_pk('public', 'ogp_fetch_attempts', ARRAY['user_id', 'url_hash'], '主キーは (user_id, url_hash)');
select col_type_is('public', 'ogp_fetch_attempts', 'started_at', 'timestamp with time zone', 'started_at は timestamptz');
select col_not_null('public', 'ogp_fetch_attempts', 'started_at', 'started_at は NOT NULL');
select col_is_null('public', 'ogp_fetch_attempts', 'completed_at', 'completed_at は NULL 可(NULL = 実行中)');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.ogp_fetch_attempts'::regclass),
  'ogp_fetch_attempts は RLS 有効'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'ogp_fetch_attempts'),
  0, 'ogp_fetch_attempts にポリシーは 1 つも無い(直接アクセスはポリシー不在で常に拒否)'
);

-- ===== 権限:テーブルへは誰も到達できない =====
select ok(
  not (has_table_privilege('authenticated', 'public.ogp_fetch_attempts', 'SELECT')
    or has_table_privilege('authenticated', 'public.ogp_fetch_attempts', 'INSERT')
    or has_table_privilege('authenticated', 'public.ogp_fetch_attempts', 'UPDATE')
    or has_table_privilege('authenticated', 'public.ogp_fetch_attempts', 'DELETE')),
  'authenticated は ogp_fetch_attempts に到達できない'
);
select ok(
  not (has_table_privilege('anon', 'public.ogp_fetch_attempts', 'SELECT')
    or has_table_privilege('anon', 'public.ogp_fetch_attempts', 'INSERT')
    or has_table_privilege('anon', 'public.ogp_fetch_attempts', 'UPDATE')
    or has_table_privilege('anon', 'public.ogp_fetch_attempts', 'DELETE')),
  'anon は ogp_fetch_attempts に到達できない'
);

-- ===== 関数属性 / 権限 =====
select is(
  (select prosecdef from pg_proc where oid = 'public.claim_ogp_fetch(text)'::regprocedure),
  true, 'claim_ogp_fetch は SECURITY DEFINER'
);
select ok(
  (select proconfig from pg_proc where oid = 'public.claim_ogp_fetch(text)'::regprocedure)
    @> ARRAY['search_path=public'],
  'claim_ogp_fetch は search_path=public を固定'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.complete_ogp_fetch(text,text)'::regprocedure),
  true, 'complete_ogp_fetch は SECURITY DEFINER'
);
select ok(
  (select proconfig from pg_proc where oid = 'public.complete_ogp_fetch(text,text)'::regprocedure)
    @> ARRAY['search_path=public'],
  'complete_ogp_fetch は search_path=public を固定'
);
select ok(
  has_function_privilege('authenticated', 'public.claim_ogp_fetch(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.complete_ogp_fetch(text,text)', 'EXECUTE'),
  'authenticated は 2 関数を EXECUTE 可'
);
select ok(
  not has_function_privilege('anon', 'public.claim_ogp_fetch(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.complete_ogp_fetch(text,text)', 'EXECUTE'),
  'anon は 2 関数を EXECUTE 不可'
);

-- 窓は 1 か所でしか定義されない(dedup・回数上限・保持期間が同じ値を指すことの担保)。
select is(
  (select public.ogp_fetch_window()),
  interval '10 minutes', 'ogp_fetch_window は 10 分'
);
select ok(
  not has_function_privilege('authenticated', 'public.ogp_fetch_window()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.ogp_fetch_window()', 'EXECUTE'),
  'authenticated / anon は ogp_fetch_window を EXECUTE 不可'
);

-- 掃除は cron から所有者権限で走る。呼び出し口をロールに開けない。
select is(
  (select prosecdef from pg_proc where oid = 'public.cleanup_ogp_fetch_attempts()'::regprocedure),
  true, 'cleanup_ogp_fetch_attempts は SECURITY DEFINER'
);
select ok(
  (select proconfig from pg_proc where oid = 'public.cleanup_ogp_fetch_attempts()'::regprocedure)
    @> ARRAY['search_path=public'],
  'cleanup_ogp_fetch_attempts は search_path=public を固定'
);
select ok(
  not has_function_privilege('authenticated', 'public.cleanup_ogp_fetch_attempts()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.cleanup_ogp_fetch_attempts()', 'EXECUTE'),
  'authenticated / anon は cleanup_ogp_fetch_attempts を EXECUTE 不可'
);

-- url_hash の CHECK は「16 進 64 文字」以外を受け付けない。URL 平文がこの列に入る経路が
-- 関数の検証だけでなく列の制約でも閉じていることを、所有者権限の直接 INSERT で確かめる。
select throws_ok(
  $$insert into public.ogp_fetch_attempts (user_id, url_hash)
    values ('11111111-1111-1111-1111-111111111111', 'https://example.com/a')$$,
  '23514', null::text,
  'url_hash は 16 進 64 文字以外を CHECK で拒む(URL 平文は列に入らない)'
);

-- ===== 挙動 =====
-- 64 桁 16 進を 3 本用意する(a… = URL A / b… = URL B / c… = URL C)。
-- 台帳はアプリを動かすと残るので、u1 の行を落としてから始める(前の状態に判定を依存させない)。
delete from public.ogp_fetch_attempts where user_id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
select public.zz_claims('11111111-1111-1111-1111-111111111111');

-- 1 本目は許可される。
select is(
  (select allowed from public.claim_ogp_fetch(repeat('a', 64))),
  true, '未取得の URL は 1 本目が許可される'
);

-- 実行中に別 URL を投げると同時実行の上限で止まる。
select is(
  (select allowed from public.claim_ogp_fetch(repeat('b', 64))),
  false, '実行中に別 URL を投げると許可されない(同時実行 1 本)'
);

-- 実行中に同じ URL を投げても止まる(paste と blur の二重発火)。
select is(
  (select allowed from public.claim_ogp_fetch(repeat('a', 64))),
  false, '実行中に同じ URL を投げても許可されない'
);

-- 終了を記録すると lease が空き、別 URL は通る。
select lives_ok(
  $$select public.complete_ogp_fetch(repeat('a', 64), 'タイトルA')$$,
  'complete_ogp_fetch は正常に完了する'
);
select is(
  (select allowed from public.claim_ogp_fetch(repeat('b', 64))),
  true, '終了記録の後は別 URL が許可される(lease が解放される)'
);
select lives_ok(
  $$select public.complete_ogp_fetch(repeat('b', 64), null)$$,
  'タイトルが取れなかった場合も終了を記録できる'
);

-- 取得済みの URL は再取得されず、取れていたタイトルがそのまま返る(通常操作を妨げない)。
select results_eq(
  $$select allowed, cached_title from public.claim_ogp_fetch(repeat('a', 64))$$,
  $$values (false, 'タイトルA'::text)$$,
  '同一 URL の再取得は許可されず、取得済みタイトルが返る'
);
-- 取れなかった URL も窓の間はキャッシュされる(空文字 = 呼び出し元は失敗表示に畳む)。
select results_eq(
  $$select allowed, cached_title from public.claim_ogp_fetch(repeat('b', 64))$$,
  $$values (false, ''::text)$$,
  '取得できなかった URL も再取得されない(失敗のキャッシュ)'
);

-- 窓(10 分)を越えた行は落ち、同じ URL を取り直せる。
set local role postgres;
update public.ogp_fetch_attempts
   set started_at = now() - interval '11 minutes'
 where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select public.zz_claims('11111111-1111-1111-1111-111111111111');
select is(
  (select allowed from public.claim_ogp_fetch(repeat('a', 64))),
  true, '窓を越えた URL は取り直せる'
);
select is(
  (select count(*)::int from public.claim_ogp_fetch(repeat('a', 64))),
  1, '戻りは常に 1 行'
);

-- 回数上限:窓内の許可回数が 30 に達したら、新しい URL は許可されない。
set local role postgres;
delete from public.ogp_fetch_attempts where user_id = '11111111-1111-1111-1111-111111111111';
insert into public.ogp_fetch_attempts (user_id, url_hash, started_at, completed_at, title)
select '11111111-1111-1111-1111-111111111111',
       lpad(to_hex(g), 64, '0'),
       now(), now(), null
  from generate_series(1, 30) g;
set local role authenticated;
select public.zz_claims('11111111-1111-1111-1111-111111111111');
select is(
  (select allowed from public.claim_ogp_fetch(repeat('c', 64))),
  false, '窓内 30 回に達したら新しい URL は許可されない(回数上限)'
);
-- 上限に達していても、取得済み URL の再利用は妨げられない。
select results_eq(
  $$select allowed from public.claim_ogp_fetch(lpad(to_hex(1), 64, '0'))$$,
  $$values (false)$$,
  '上限到達後も取得済み URL は外へ出ずに畳まれる'
);

-- ===== 入力・認証の防御 =====
select throws_ok(
  $$select public.claim_ogp_fetch('not-a-sha256')$$,
  'P0001', 'invalid url hash', '64 桁 16 進でない鍵は invalid url hash 例外'
);
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$select public.claim_ogp_fetch(repeat('a', 64))$$,
  'P0001', 'not authenticated', '未認証の claim_ogp_fetch は not authenticated 例外'
);
select throws_ok(
  $$select public.complete_ogp_fetch(repeat('a', 64), 'x')$$,
  'P0001', 'not authenticated', '未認証の complete_ogp_fetch は not authenticated 例外'
);

set local role postgres;

-- ===== 鍵(url_hash)の作り方 =====
-- 台帳に載るのは URL ではなく「その利用者の uid を鍵にした HMAC-SHA256」(16 進 64 文字)。
-- 鍵を作るのはアプリ側(apps/web/src/lib/ogp/fetch-throttle.ts の urlKey)なので、**この関数の
-- 実装そのものは SQL からは観測できない**。ここで固定するのは、その実装が満たすべき方式の性質
-- —— dedup が要求する決定性と、利用者を跨いだ対応表の無効化 —— で、pgcrypto に同じ計算を
-- させて確かめる(pgcrypto は検証専用。マイグレーション側はこの拡張に依存していない)。
select is(
  extensions.hmac('https://example.com/a', '11111111-1111-1111-1111-111111111111', 'sha256'),
  extensions.hmac('https://example.com/a', '11111111-1111-1111-1111-111111111111', 'sha256'),
  '同じ利用者が同じ URL を貼れば鍵は同じ値になる(dedup の前提)'
);
select isnt(
  extensions.hmac('https://example.com/a', '11111111-1111-1111-1111-111111111111', 'sha256'),
  extensions.hmac('https://example.com/a', '22222222-2222-2222-2222-222222222222', 'sha256'),
  '同じ URL でも利用者が違えば鍵は別の値になる(利用者を跨いだ対応表を無効化する)'
);
select matches(
  encode(extensions.hmac('https://example.com/a', '11111111-1111-1111-1111-111111111111', 'sha256'), 'hex'),
  '^[0-9a-f]{64}$',
  '鍵の形は 16 進 64 文字(url_hash の CHECK と claim_ogp_fetch の検証を通る形)'
);

-- 鍵を変えても dedup が壊れていないことを、実際の鍵で端から端まで確かめる。
delete from public.ogp_fetch_attempts where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select public.zz_claims('11111111-1111-1111-1111-111111111111');
select is(
  (select allowed from public.claim_ogp_fetch(
     encode(extensions.hmac('https://example.com/a', '11111111-1111-1111-1111-111111111111', 'sha256'), 'hex'))),
  true, 'HMAC で作った鍵は claim に受理される'
);
select lives_ok(
  $$select public.complete_ogp_fetch(
      encode(extensions.hmac('https://example.com/a', '11111111-1111-1111-1111-111111111111', 'sha256'), 'hex'),
      'タイトルH')$$,
  'HMAC で作った鍵で終了を記録できる'
);
select results_eq(
  $$select allowed, cached_title from public.claim_ogp_fetch(
      encode(extensions.hmac('https://example.com/a', '11111111-1111-1111-1111-111111111111', 'sha256'), 'hex'))$$,
  $$values (false, 'タイトルH'::text)$$,
  '同じ利用者が同じ URL を貼り直すと、外へ出ずに取得済みタイトルが返る(dedup は壊れていない)'
);

-- ===== 保持期間の上限(cleanup) =====
-- claim の中の掃除は呼ばれた利用者の行しか落とさないので、掃除の本体は cron から全ユーザーぶんを
-- 落とす。cron が実際に発火することはローカルでは確かめられない(pg_cron・spec §11.3)ので、
-- ここで確かめるのは関数を直接呼んだときの挙動。Job の登録は 05_cron.sql が見る。
set local role postgres;
delete from public.ogp_fetch_attempts
 where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
insert into public.ogp_fetch_attempts (user_id, url_hash, started_at, completed_at, title) values
  ('11111111-1111-1111-1111-111111111111', lpad('e1', 64, '0'), now() - interval '11 minutes', now() - interval '11 minutes', 'タイトルE1'),
  ('22222222-2222-2222-2222-222222222222', lpad('e2', 64, '0'), now() - interval '11 minutes', now() - interval '11 minutes', 'タイトルE2'),
  ('11111111-1111-1111-1111-111111111111', lpad('d1', 64, '0'), now() - interval '9 minutes',  now() - interval '9 minutes',  'タイトルD1'),
  ('22222222-2222-2222-2222-222222222222', lpad('d2', 64, '0'), now() - interval '9 minutes',  now() - interval '9 minutes',  'タイトルD2'),
  ('11111111-1111-1111-1111-111111111111', lpad('f1', 64, '0'), now(), null, null),
  ('22222222-2222-2222-2222-222222222222', lpad('f2', 64, '0'), now(), null, null);

select lives_ok(
  $$select public.cleanup_ogp_fetch_attempts()$$,
  'cleanup_ogp_fetch_attempts は正常に完了する'
);
select is(
  (select count(*)::int from public.ogp_fetch_attempts
    where url_hash in (lpad('e1', 64, '0'), lpad('e2', 64, '0'))),
  0, '窓を越えた行は、どの利用者のものでも消える(claim を呼ばない利用者の行も残らない)'
);
select is(
  (select count(*)::int from public.ogp_fetch_attempts
    where url_hash in (lpad('d1', 64, '0'), lpad('d2', 64, '0'), lpad('f1', 64, '0'), lpad('f2', 64, '0'))),
  4, '窓の内側の行は残る(まだ dedup と回数上限の判定に使われる)'
);
select is(
  (select count(*)::int from public.ogp_fetch_attempts
    where started_at < now() - public.ogp_fetch_window()),
  0, '掃除の後、窓を越えた行は台帳全体に 1 行も無い'
);

select * from finish();
rollback;
