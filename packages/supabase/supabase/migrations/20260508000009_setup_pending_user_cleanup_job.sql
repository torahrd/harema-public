-- =============================
-- 削除関数(SECURITY DEFINER で auth.users への DELETE 権限を取得)
-- =============================
create or replace function public.cleanup_pending_users()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.users
  where id in (
    select u.id
    from auth.users u
    left join public.user_agreements ua on ua.user_id = u.id
    where ua.user_id is null
      and u.created_at < now() - interval '24 hours'
  );
end;
$$;

comment on function public.cleanup_pending_users is
  '24 時間以上経過した未同意ユーザー(user_agreements 未作成)を auth.users から物理削除。auth.users への削除は FK の on delete cascade により profiles / user_agreements / saved_places へ波及する(未同意ユーザーには通常これらのレコードは存在しない)';

-- =============================
-- EXECUTE 権限の明示 REVOKE
-- =============================
-- PostgreSQL は新規関数に EXECUTE TO PUBLIC を既定付与する(PUBLIC は anon /
-- authenticated を含む)。関数には RLS が適用されないため、明示 REVOKE で
-- RPC 経由の呼び出し面を閉じる。cron は関数所有者権限で実行されるため、
-- anon / authenticated への GRANT は不要(付与しない)。
revoke execute on function public.cleanup_pending_users() from public;

-- =============================
-- Supabase Cron Job 登録(毎時 0 分実行)
-- =============================
select cron.schedule(
  'cleanup_pending_users',
  '0 * * * *',
  $$select public.cleanup_pending_users();$$
);
