-- 公開の後の監視(harema#168): 定期実行の成否を、3 つの真偽で返す関数。
--
-- 使い道: web の確かめ用の口 GET /api/health/cron が service_role で呼び、Google Cloud の Uptime check が
--   15 分ごとに叩く。2xx でなければ所有者にメールが届く。この関数は読み取りだけで、何も書かない。
--
-- 返す 3 列(いずれも「直近に成功した記録がある」):
--   refresh_places : private.place_refresh_runs に claimed_at が 26 時間以内の行がある。
--                    Vercel の Hobby の Cron は指定の時の 1 時間の中のどこかで動くので、前日 06:00・当日 06:59 UTC の
--                    間隔は最長 24 時間 59 分。26 時間で 1 時間の余りを持つ。
--                    見るのは「Cron が来て、秘密の照合を通り、台帳に行が入った」まで。取り直しの 1 件ごとの失敗は見ない。
--   cleanup_ogp    : cleanup_ogp_fetch_attempts(10 分ごと)の succeeded が 30 分以内にある(続けて 2 回落ちたら false)。
--   purge_coords   : purge_stale_place_coordinates(毎時 17 分)の succeeded が 3 時間以内にある(1 回の抜けは許す)。
--                    規約の 30 日までの余りは 23 時間(20261103000001 の冒頭)で、3 時間と知らせの遅れはその内側。
--   job は名前で cron.job から引く。job が外されていれば false になる。
--
-- cron.job_run_details は消す仕組みが無く増え続ける表なので、新しい順(主キー runid の逆順)の 100 行だけを見る。
--   行数が増えても読む量が変わらない。
--
-- 権限: SECURITY DEFINER(cron スキーマと private スキーマは service_role に開けない)・search_path は空・
--   public execute を revoke し、service_role だけに grant する(claim_place_refresh_batch と同じ形)。
--   anon に実行を許さない。publishable key は公開の値で、誰でも PostgREST から直接呼べてしまうため。
--   利用者のデータも識別子も返さない。

create function public.cron_health()
returns table (refresh_places boolean, cleanup_ogp boolean, purge_coords boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with recent as (
    select d.jobid, d.status, d.start_time
      from cron.job_run_details d
     order by d.runid desc
     limit 100
  )
  select
    exists (select 1 from private.place_refresh_runs r
             where r.claimed_at > now() - interval '26 hours'),
    exists (select 1 from recent d join cron.job j on j.jobid = d.jobid
             where j.jobname = 'cleanup_ogp_fetch_attempts'
               and d.status = 'succeeded'
               and d.start_time > now() - interval '30 minutes'),
    exists (select 1 from recent d join cron.job j on j.jobid = d.jobid
             where j.jobname = 'purge_stale_place_coordinates'
               and d.status = 'succeeded'
               and d.start_time > now() - interval '3 hours');
$$;

revoke all on function public.cron_health() from public, anon, authenticated, service_role;
grant execute on function public.cron_health() to service_role;

comment on function public.cron_health() is
  '定期実行の成否(refresh_places・cleanup_ogp・purge_coords)の 3 つの真偽。service_role だけが実行できる。harema#168';
