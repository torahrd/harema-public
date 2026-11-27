-- 20261122000001_cron_health.sql(harema#168): 定期実行の成否の関数 public.cron_health()。
-- cron.job_run_details の連番 cron.runid_seq は postgres に権限が無いので、runid は値で渡す。
begin;
select plan(11);

delete from cron.job_run_details;
delete from private.place_refresh_runs;

select results_eq('select refresh_places, cleanup_ogp, purge_coords from public.cron_health()',
  $$values (false, false, false)$$, '記録が無ければ 3 つとも false');

insert into private.place_refresh_runs (run_day, claimed_at) values ((now() at time zone 'utc')::date, now() - interval '25 hours');
insert into cron.job_run_details (runid, jobid, status, start_time)
  select 900001, jobid, 'succeeded', now() - interval '29 minutes' from cron.job where jobname = 'cleanup_ogp_fetch_attempts';
insert into cron.job_run_details (runid, jobid, status, start_time)
  select 900002, jobid, 'succeeded', now() - interval '2 hours 59 minutes' from cron.job where jobname = 'purge_stale_place_coordinates';
select results_eq('select refresh_places, cleanup_ogp, purge_coords from public.cron_health()',
  $$values (true, true, true)$$, '窓の内側の成功が 1 つずつあれば 3 つとも true');

set local role service_role;
select results_eq('select refresh_places, cleanup_ogp, purge_coords from public.cron_health()',
  $$values (true, true, true)$$, 'service_role が呼んでも cron と台帳を読める(SECURITY DEFINER)');
reset role;

-- 古い行(小さい runid・1 日前)を 150 行足しても、新しい順の 100 行に新しい成功が入っていれば true のまま。
insert into cron.job_run_details (runid, jobid, status, start_time)
  select g, (select jobid from cron.job where jobname = 'cleanup_ogp_fetch_attempts'), 'succeeded', now() - interval '1 day'
    from generate_series(1, 150) g;
select results_eq('select refresh_places, cleanup_ogp, purge_coords from public.cron_health()',
  $$values (true, true, true)$$, '古い 150 行の後ろに新しい成功があれば 3 つとも true');
delete from cron.job_run_details where runid < 900001;

update private.place_refresh_runs set claimed_at = now() - interval '27 hours';
select results_eq('select refresh_places, cleanup_ogp, purge_coords from public.cron_health()',
  $$values (false, true, true)$$, '台帳が 26 時間より前なら refresh だけ false');

update cron.job_run_details set status = 'failed';
select results_eq('select refresh_places, cleanup_ogp, purge_coords from public.cron_health()',
  $$values (false, false, false)$$, '失敗だけなら false');

update cron.job_run_details set status = 'succeeded', start_time = now() - interval '31 minutes'
 where jobid = (select jobid from cron.job where jobname = 'cleanup_ogp_fetch_attempts');
update cron.job_run_details set status = 'succeeded', start_time = now() - interval '3 hours 1 minute'
 where jobid = (select jobid from cron.job where jobname = 'purge_stale_place_coordinates');
select results_eq('select refresh_places, cleanup_ogp, purge_coords from public.cron_health()',
  $$values (false, false, false)$$, '窓の外の成功は false');

select ok(not has_function_privilege('anon', 'public.cron_health()', 'execute'), 'anon は実行できない');
select ok(not has_function_privilege('authenticated', 'public.cron_health()', 'execute'), 'authenticated は実行できない');
select ok(has_function_privilege('service_role', 'public.cron_health()', 'execute'), 'service_role は実行できる');
select is((select proconfig::text from pg_proc where oid = 'public.cron_health()'::regprocedure), '{"search_path=\"\""}', 'search_path は空');

select * from finish();
rollback;
