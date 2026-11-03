-- Supabase Cron(同意なしユーザーの 24 時間自動削除に使用、マイグレーション 9 で利用)
create extension if not exists "pg_cron";

-- 保存状態の enum
create type public.saved_place_status as enum (
  'want_to_go',
  'visit_again',
  'no_thanks'
);
comment on type public.saved_place_status is 'ユーザーが保存した店の3状態';
