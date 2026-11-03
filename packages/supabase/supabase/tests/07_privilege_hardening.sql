-- 権限の全面照合(20260729000001 / 20260729000002 の鏡像)
--
-- 02_grants.sql は WP-01 の契約鏡像として「契約どおりの権限があるか」を逐条で見る。
-- こちらはその上位互換で、「契約に無い権限が無いか」を ACL の集合として照合し、
-- さらに pg_default_acl(将来オブジェクトの既定)と、新規オブジェクトを実際に作ってみる
-- プローブまで見る。2026-07-29 の本番過剰付与(anon が 4 テーブル + 4 関数へ到達できた)を
-- そのまま符号化した回帰試験。
--
-- 判定は has_*_privilege(実効権限=明示 + PUBLIC + ロール継承の合算)と aclexplode(ACL の生エントリ)で行う。
-- table_privs_are / function_privs_are は使わない —— pgTAP の版によって既知の権限名リストが違い、
-- PostgreSQL 17 の MAINTAIN を知らない版では期待配列が作れない。
--
-- ローカルが緑でも本番が直っている証拠にはならない(ローカルと本番は pg_default_acl の出発点が違う)。
-- 本番の証拠は docs/verification/ の本番 SQL の実行結果だけ。
begin;
select plan(47);

create temporary view v_public_rel as
select c.oid, c.relname, c.relkind,
       coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner)) as acl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind in ('r', 'p', 'v', 'm', 'f', 'S');

create temporary view v_rel_acl as
select r.relname,
       case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee_name,
       a.privilege_type
from v_public_rel r
cross join lateral aclexplode(r.acl) a;

create temporary view v_fn_acl as
select p.oid,
       case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee_name,
       a.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a;

-- ===== §1 4 テーブルに anon の ACL エントリが 1 件も無い =====
-- 契約「anon には一切付与しない」の literal。Dxtm(TRUNCATE / REFERENCES / TRIGGER / MAINTAIN)も許さない。
select is((select count(*)::int from v_rel_acl where relname = 'profiles'        and grantee_name = 'anon'), 0, 'profiles に anon の ACL エントリが無い');
select is((select count(*)::int from v_rel_acl where relname = 'user_agreements' and grantee_name = 'anon'), 0, 'user_agreements に anon の ACL エントリが無い');
select is((select count(*)::int from v_rel_acl where relname = 'places'          and grantee_name = 'anon'), 0, 'places に anon の ACL エントリが無い');
select is((select count(*)::int from v_rel_acl where relname = 'saved_places'    and grantee_name = 'anon'), 0, 'saved_places に anon の ACL エントリが無い');
select is((select count(*)::int from v_rel_acl where relname = 'ogp_fetch_attempts' and grantee_name = 'anon'), 0, 'ogp_fetch_attempts に anon の ACL エントリが無い');

-- ===== §2 authenticated の権限集合が migration 8 の契約と完全一致 =====
select is(
  (select array_agg(privilege_type order by privilege_type) from v_rel_acl where relname = 'profiles' and grantee_name = 'authenticated'),
  array['SELECT', 'UPDATE'],
  'profiles の authenticated は SELECT / UPDATE のみ(INSERT は complete_onboarding だけ・login-replace 改訂 6)'
);
select is(
  (select array_agg(privilege_type order by privilege_type) from v_rel_acl where relname = 'user_agreements' and grantee_name = 'authenticated'),
  array['SELECT'],
  'user_agreements の authenticated は SELECT のみ(INSERT は complete_onboarding だけ・login-replace 改訂 6)'
);
select is(
  (select array_agg(privilege_type order by privilege_type) from v_rel_acl where relname = 'places' and grantee_name = 'authenticated'),
  array['SELECT'],
  'places の authenticated は SELECT のみ(書込はサーバの service_role 経由)'
);
select is(
  (select array_agg(privilege_type order by privilege_type) from v_rel_acl where relname = 'saved_places' and grantee_name = 'authenticated'),
  array['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  'saved_places の authenticated は SELECT / INSERT / UPDATE / DELETE のみ'
);
-- ogp_fetch_attempts は GRANT を 1 つも出さない(claim_ogp_fetch / complete_ogp_fetch 経由でのみ触れる)。
select is(
  (select count(*)::int from v_rel_acl
    where relname = 'ogp_fetch_attempts'
      and grantee_name in ('authenticated', 'anon', 'service_role', 'PUBLIC')),
  0,
  'ogp_fetch_attempts に authenticated / anon / service_role / PUBLIC の ACL エントリが無い'
);

-- ===== §3 service_role は 4 テーブルの S/I/U/D を保持する(migration 8 の明示契約・剥がさない)=====
select ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT') and has_table_privilege('service_role', 'public.profiles', 'INSERT')
  and has_table_privilege('service_role', 'public.profiles', 'UPDATE') and has_table_privilege('service_role', 'public.profiles', 'DELETE'),
  'service_role は profiles に SELECT/INSERT/UPDATE/DELETE を持つ'
);
select ok(
  has_table_privilege('service_role', 'public.user_agreements', 'SELECT') and has_table_privilege('service_role', 'public.user_agreements', 'INSERT')
  and has_table_privilege('service_role', 'public.user_agreements', 'UPDATE') and has_table_privilege('service_role', 'public.user_agreements', 'DELETE'),
  'service_role は user_agreements に SELECT/INSERT/UPDATE/DELETE を持つ'
);
select ok(
  has_table_privilege('service_role', 'public.places', 'SELECT') and has_table_privilege('service_role', 'public.places', 'INSERT')
  and has_table_privilege('service_role', 'public.places', 'UPDATE') and has_table_privilege('service_role', 'public.places', 'DELETE'),
  'service_role は places に SELECT/INSERT/UPDATE/DELETE を持つ'
);
select ok(
  has_table_privilege('service_role', 'public.saved_places', 'SELECT') and has_table_privilege('service_role', 'public.saved_places', 'INSERT')
  and has_table_privilege('service_role', 'public.saved_places', 'UPDATE') and has_table_privilege('service_role', 'public.saved_places', 'DELETE'),
  'service_role は saved_places に SELECT/INSERT/UPDATE/DELETE を持つ'
);

-- ===== §4 4 テーブルに PUBLIC エントリが無い =====
select is(
  (select count(*)::int from v_rel_acl
    where relname in ('profiles', 'user_agreements', 'places', 'saved_places') and grantee_name = 'PUBLIC'),
  0, '4 テーブルに PUBLIC の ACL エントリが無い'
);

-- ===== §5 4 関数の ACL が (grantee, privilege) の集合として契約と完全一致 =====
select is(
  (select array_agg(distinct grantee_name || ':' || privilege_type order by grantee_name || ':' || privilege_type)
     from v_fn_acl where oid = 'public.upsert_place(text,numeric,numeric)'::regprocedure),
  array['postgres:EXECUTE'],
  'upsert_place の EXECUTE は postgres のみ'
);
select is(
  (select array_agg(distinct grantee_name || ':' || privilege_type order by grantee_name || ':' || privilege_type)
     from v_fn_acl where oid = 'public.complete_onboarding(text)'::regprocedure),
  array['authenticated:EXECUTE', 'postgres:EXECUTE'],
  'complete_onboarding の EXECUTE は postgres と authenticated のみ'
);
select is(
  (select array_agg(distinct grantee_name || ':' || privilege_type order by grantee_name || ':' || privilege_type)
     from v_fn_acl where oid = 'public.session_is_valid()'::regprocedure),
  array['authenticated:EXECUTE', 'postgres:EXECUTE'],
  'session_is_valid の EXECUTE は postgres と authenticated のみ'
);
select is(
  (select array_agg(distinct grantee_name || ':' || privilege_type order by grantee_name || ':' || privilege_type)
     from v_fn_acl where oid = 'public.revoke_this_session()'::regprocedure),
  array['authenticated:EXECUTE', 'postgres:EXECUTE'],
  'revoke_this_session の EXECUTE は postgres と authenticated のみ'
);
select is(
  (select array_agg(distinct grantee_name || ':' || privilege_type order by grantee_name || ':' || privilege_type)
     from v_fn_acl where oid = 'public.begin_withdrawal()'::regprocedure),
  array['authenticated:EXECUTE', 'postgres:EXECUTE'],
  'begin_withdrawal の EXECUTE は postgres と authenticated のみ'
);
select is(
  (select array_agg(distinct grantee_name || ':' || privilege_type order by grantee_name || ':' || privilege_type)
     from v_fn_acl where oid = 'public.finish_withdrawal()'::regprocedure),
  array['authenticated:EXECUTE', 'postgres:EXECUTE'],
  'finish_withdrawal の EXECUTE は postgres と authenticated のみ'
);
select is(
  (select array_agg(distinct grantee_name || ':' || privilege_type order by grantee_name || ':' || privilege_type)
     from v_fn_acl where oid = 'public.check_request()'::regprocedure),
  array['authenticated:EXECUTE', 'postgres:EXECUTE', 'service_role:EXECUTE'],
  'check_request の EXECUTE は postgres と authenticated と service_role のみ(PostgREST の pre-request は役割の切り替え後に呼ぶ)'
);
select is(
  (select array_agg(distinct grantee_name || ':' || privilege_type order by grantee_name || ':' || privilege_type)
     from v_fn_acl where oid = 'public.set_updated_at()'::regprocedure),
  array['postgres:EXECUTE'],
  'set_updated_at の EXECUTE は postgres のみ(PUBLIC 既定も剥がしてある)'
);
select is(
  (select array_agg(distinct grantee_name || ':' || privilege_type order by grantee_name || ':' || privilege_type)
     from v_fn_acl where oid = 'public.claim_ogp_fetch(text)'::regprocedure),
  array['authenticated:EXECUTE', 'postgres:EXECUTE'],
  'claim_ogp_fetch の EXECUTE は postgres と authenticated のみ'
);
select is(
  (select array_agg(distinct grantee_name || ':' || privilege_type order by grantee_name || ':' || privilege_type)
     from v_fn_acl where oid = 'public.complete_ogp_fetch(text,text)'::regprocedure),
  array['authenticated:EXECUTE', 'postgres:EXECUTE'],
  'complete_ogp_fetch の EXECUTE は postgres と authenticated のみ'
);
select is(
  (select array_agg(distinct grantee_name || ':' || privilege_type order by grantee_name || ':' || privilege_type)
     from v_fn_acl where oid = 'public.cleanup_ogp_fetch_attempts()'::regprocedure),
  array['postgres:EXECUTE'],
  'cleanup_ogp_fetch_attempts の EXECUTE は postgres のみ(cron は所有者権限で実行する)'
);
select is(
  (select array_agg(distinct grantee_name || ':' || privilege_type order by grantee_name || ':' || privilege_type)
     from v_fn_acl where oid = 'public.ogp_fetch_window()'::regprocedure),
  array['postgres:EXECUTE'],
  'ogp_fetch_window の EXECUTE は postgres のみ(呼ぶのは同スキーマの関数だけ)'
);

select is(
  (select array_agg(distinct grantee_name || ':' || privilege_type order by grantee_name || ':' || privilege_type)
     from v_fn_acl where oid = 'public.claim_place_refresh_batch(integer)'::regprocedure),
  array['postgres:EXECUTE', 'service_role:EXECUTE'],
  'claim_place_refresh_batch の EXECUTE は postgres と service_role のみ(定期の取り直しの対象の取得はサーバだけ)'
);

-- ===== §6 public 全体の棚卸し:anon が到達できるオブジェクトは 0 件 =====
-- 例外を 1 件でも許すと、以後この不変条件は「1 件だけ info」という運用になり、
-- 新しい取りこぼしがその info に紛れる。例外なしで書く。
select is(
  (select count(*)::int from v_public_rel r
    where exists (select 1 from aclexplode(r.acl) a
                   where a.grantee = 0 or a.grantee = (select oid from pg_roles where rolname = 'anon'))
       or (r.relkind = 'S' and (has_sequence_privilege('anon', r.oid, 'USAGE')
                             or has_sequence_privilege('anon', r.oid, 'SELECT')
                             or has_sequence_privilege('anon', r.oid, 'UPDATE')))
       or (r.relkind <> 'S' and (has_table_privilege('anon', r.oid, 'SELECT')
                              or has_table_privilege('anon', r.oid, 'INSERT')
                              or has_table_privilege('anon', r.oid, 'UPDATE')
                              or has_table_privilege('anon', r.oid, 'DELETE')
                              or has_table_privilege('anon', r.oid, 'TRUNCATE')
                              or has_table_privilege('anon', r.oid, 'REFERENCES')
                              or has_table_privilege('anon', r.oid, 'TRIGGER')))),
  0,
  'anon が到達できる public のリレーションは 0 件(明示 / PUBLIC / 継承のいずれの経路でも)'
);
select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'anon が EXECUTE できる public の関数は 0 件(set_updated_at を含む)'
);
-- 棚卸しの網羅性:public にオブジェクトが増えたら、上の 2 つと §1〜§5 の期待集合を更新させる。
select is((select count(*)::int from v_public_rel), 5, 'public のリレーションは 5 件(増減したら本テストの期待値を更新する)');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'),
  13, 'public の関数は 13 件(増減したら本テストの期待値を更新する)'
);

-- ===== §7 pg_default_acl(将来オブジェクトの既定)—— per-schema 行と global 行の両方を見る =====
-- ALTER DEFAULT PRIVILEGES は IN SCHEMA の有無で別の行に落ちる(per-schema = defaclnamespace が
-- スキーマの oid / global = defaclnamespace が 0)。per-schema 行だけを見る join を書くと、
-- global 行は構造的に視界に入らない。20260729000002 は両方を書くので、判定も両方を見る。
select is(
  (select count(*)::int
     from pg_default_acl d
     join pg_namespace n on n.oid = d.defaclnamespace and n.nspname = 'public'
     cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = (select oid from pg_roles where rolname = 'postgres')
      and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role'))),
  0,
  'pg_default_acl の per-schema 行(postgres / public)に anon / authenticated / service_role / PUBLIC が現れない'
);
select is(
  (select count(*)::int
     from pg_default_acl d
     cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = (select oid from pg_roles where rolname = 'postgres')
      and d.defaclnamespace = 0
      and pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role')),
  0,
  'pg_default_acl の global 行(postgres)に anon / authenticated / service_role が現れない'
);
-- global の functions 行が「存在すること」自体が、20260729000002 の (2) が効いた直接証拠。
-- hard-wired の「PUBLIC に EXECUTE」既定は、この行が override して初めて消える。
-- per-schema 形ではこの行が作られないので、行の不在 = global 形が失われたということ。
select is(
  (select count(*)::int
     from pg_default_acl d
    where d.defaclrole = (select oid from pg_roles where rolname = 'postgres')
      and d.defaclnamespace = 0
      and d.defaclobjtype = 'f'
      and not exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 0)),
  1,
  'pg_default_acl に global の functions 行が存在し、その ACL に PUBLIC が現れない'
);

-- ===== §8 set_updated_at の EXECUTE を誰も持たなくてもトリガーは発火する =====
-- §5 で set_updated_at の EXECUTE を postgres のみに絞ったことの安全性の実証。
-- PostgreSQL はトリガー発火時に呼び出し元の EXECUTE を再検査しない、という理解の実測。
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '11111111-1111-1111-1111-111111111111',
  'role', 'authenticated',
  'iss', 'https://securetoken.google.com/demo-login-replace',
  'aud', 'demo-login-replace',
  'auth_time', extract(epoch from now() - interval '1 minute')::bigint
)::text, true);

select lives_ok(
  $$update public.profiles set username = 'trg_probe' where id = '11111111-1111-1111-1111-111111111111'$$,
  'authenticated による profiles の UPDATE が 42501 にならない(set_updated_at の EXECUTE を持たなくても発火する)'
);
select is(
  (select updated_at from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  now(),
  'set_updated_at が発火し updated_at がトランザクション時刻に更新される'
);

set local role postgres;

-- ===== §9 プローブ:いま public に新しく作ったオブジェクトへ到達できるか =====
-- 20260729000002 が「これから作られるオブジェクト」に効いていることを、毎回の db reset で実証する。
create table public.zz_privilege_probe (
  id   int generated always as identity,
  memo text
);
create function public.zz_privilege_probe_fn() returns int language sql as $fn$ select 1 $fn$;

select is(
  (select count(*)::int
     from pg_class c
     cross join lateral aclexplode(coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
    where c.oid = 'public.zz_privilege_probe'::regclass
      and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role'))),
  0,
  'プローブ:新規テーブルに anon / authenticated / service_role / PUBLIC のエントリが焼き付かない'
);
select ok(
  not (has_table_privilege('anon', 'public.zz_privilege_probe', 'SELECT') or has_table_privilege('anon', 'public.zz_privilege_probe', 'INSERT')
    or has_table_privilege('anon', 'public.zz_privilege_probe', 'UPDATE') or has_table_privilege('anon', 'public.zz_privilege_probe', 'DELETE')
    or has_table_privilege('anon', 'public.zz_privilege_probe', 'TRUNCATE')),
  'プローブ:anon は新規テーブルに到達できない'
);
select ok(
  not (has_table_privilege('authenticated', 'public.zz_privilege_probe', 'SELECT') or has_table_privilege('authenticated', 'public.zz_privilege_probe', 'INSERT')
    or has_table_privilege('authenticated', 'public.zz_privilege_probe', 'UPDATE') or has_table_privilege('authenticated', 'public.zz_privilege_probe', 'DELETE')
    or has_table_privilege('authenticated', 'public.zz_privilege_probe', 'TRUNCATE')),
  'プローブ:authenticated は新規テーブルに到達できない(明示 GRANT を書くまで fail-closed)'
);
select ok(
  not (has_table_privilege('service_role', 'public.zz_privilege_probe', 'SELECT') or has_table_privilege('service_role', 'public.zz_privilege_probe', 'INSERT')
    or has_table_privilege('service_role', 'public.zz_privilege_probe', 'UPDATE') or has_table_privilege('service_role', 'public.zz_privilege_probe', 'DELETE')
    or has_table_privilege('service_role', 'public.zz_privilege_probe', 'TRUNCATE')),
  'プローブ:service_role は新規テーブルに到達できない'
);
-- identity 列の内部シーケンス:20260729000002 の sequences 既定 revoke の実証(既存シーケンスは現存 0)。
select ok(
  not exists (
    select 1
    from pg_class s
    join pg_depend dep on dep.objid = s.oid and dep.deptype = 'i'
    cross join (values ('anon'), ('authenticated'), ('service_role')) role_name(r)
    where s.relkind = 'S' and dep.refobjid = 'public.zz_privilege_probe'::regclass
      and (has_sequence_privilege(role_name.r, s.oid, 'USAGE')
        or has_sequence_privilege(role_name.r, s.oid, 'SELECT')
        or has_sequence_privilege(role_name.r, s.oid, 'UPDATE'))
  ),
  'プローブ:identity 列の内部シーケンスにも anon / authenticated / service_role は到達できない'
);
select is(
  (select count(*)::int
     from pg_proc p
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
    where p.oid = 'public.zz_privilege_probe_fn()'::regprocedure
      and pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role')),
  0,
  'プローブ:新規関数に anon / authenticated / service_role の明示エントリが焼き付かない'
);
-- 次の 2 つは 20260729000002 の (2)(global 形 = IN SCHEMA 無しの ALTER DEFAULT PRIVILEGES)が
-- 効いていることの直接証拠。per-schema 形の REVOKE では hard-wired の PUBLIC EXECUTE 既定を落とせず、
-- 新規関数は proacl = NULL のまま(= 既定がそのまま残る)なので anon が到達できてしまう
-- —— 2026-07-30 にローカルで両形を並べて実測した(生出力:docs/verification/R2-fix.md §0)。
-- global 形はその既定を override するので、proacl に明示エントリが焼き付き PUBLIC は含まれない。
-- ここが RED に変わったら、疑うのはテストではなく migration 20260729000002 の (2)。
select ok(
  not has_function_privilege('anon', 'public.zz_privilege_probe_fn()', 'EXECUTE'),
  'プローブ:新規関数へ anon は到達できない(オブジェクトごとの revoke を 1 文も書いていない時点で)'
);
select ok(
  (select proacl is not null from pg_proc where oid = 'public.zz_privilege_probe_fn()'::regprocedure),
  'プローブ:新規関数の proacl が NULL でない(hard-wired 既定が override された証拠)'
);
-- 回帰:オブジェクトごとの明示 revoke も従来どおり効く(既定と二重の防御になっている)。
revoke execute on function public.zz_privilege_probe_fn() from public;
select ok(
  not has_function_privilege('anon', 'public.zz_privilege_probe_fn()', 'EXECUTE'),
  'プローブ:revoke execute … from public を書いた後も anon の到達は 0 のまま'
);

-- global 形は「postgres が作る関数」に効くので、影響は public に限らない。
-- この 1 件は安全性の assert ではなく、影響範囲を毎回可視化するためのもの
-- —— 緑 = 安全ではなく、緑 = 想定どおりの影響範囲。RED に変わったら影響範囲の理解が変わったということ。
create schema zz_privilege_probe_other;
create function zz_privilege_probe_other.zz_probe_fn() returns int language sql as $fn$ select 1 $fn$;
select ok(
  not has_function_privilege('anon', 'zz_privilege_probe_other.zz_probe_fn()', 'EXECUTE'),
  'プローブ:public 以外のスキーマの新規関数にも既定が効く(global 形の影響範囲の可視化)'
);

select * from finish();
rollback;
