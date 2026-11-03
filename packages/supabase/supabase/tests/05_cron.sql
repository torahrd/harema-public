-- cron 検証:登録されている Job とスケジュールを見る。
-- ローカルでは Job 登録の確認までが完了条件(実削除挙動の検証は本番)。
-- 削除そのものは関数を直接呼べば確かめられるので、そちらは各関数のテストが持つ
-- (cleanup_ogp_fetch_attempts の挙動は 08_ogp_fetch_throttle.sql)。
-- 同意前のアカウントの掃除は Firebase 側の毎時の関数が行うため、DB の cron には無い
-- (cleanup_pending_users の job と関数は login-replace の migration で撤去した)。
begin;
select plan(5);

select is(
  (select count(*)::int from cron.job where jobname = 'cleanup_pending_users'),
  0, 'cron.job に cleanup_pending_users が無い(撤去済み)'
);

select is(
  (select count(*)::int from cron.job where jobname = 'cleanup_ogp_fetch_attempts'),
  1, 'cron.job に cleanup_ogp_fetch_attempts が 1 行登録されている'
);
select is(
  (select schedule from cron.job where jobname = 'cleanup_ogp_fetch_attempts'),
  '*/10 * * * *', 'スケジュールは */10 * * * *(抑制の窓と同じ 10 分ごと)'
);

select is(
  (select count(*)::int from cron.job where jobname = 'purge_stale_place_coordinates'),
  1, 'cron.job に purge_stale_place_coordinates が 1 行登録されている'
);
select is(
  (select schedule from cron.job where jobname = 'purge_stale_place_coordinates'),
  '17 * * * *', 'スケジュールは 17 * * * *(毎時。最長 29 日 + 1 時間で 30 日を越えない)'
);

select * from finish();
rollback;
