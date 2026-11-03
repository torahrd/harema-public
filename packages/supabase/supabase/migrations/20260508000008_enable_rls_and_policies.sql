-- =============================
-- RLS 有効化
-- =============================
alter table public.profiles enable row level security;
alter table public.user_agreements enable row level security;
alter table public.places enable row level security;
alter table public.saved_places enable row level security;

-- =============================
-- profiles: 自分のレコードのみアクセス可能
-- =============================
create policy "profiles_select_own" on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_insert_own" on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- DELETE ポリシーは作らない(auth.users の cascade に任せる)

-- =============================
-- user_agreements: 自分のレコードのみ SELECT/INSERT 可能
-- =============================
create policy "user_agreements_select_own" on public.user_agreements
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_agreements_insert_own" on public.user_agreements
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- UPDATE / DELETE ポリシーは作らない(同意は改竄不可、削除は auth.users の cascade に任せる)

-- =============================
-- places: 認証ユーザーは全件 SELECT のみ(共有キャッシュ)
-- 書込(INSERT/UPDATE)の直接ポリシーは置かない
-- =============================
create policy "places_select_authenticated" on public.places
  for select
  to authenticated
  using (true);

-- INSERT / UPDATE ポリシーは作らない:
--   places への書込は SECURITY DEFINER 関数 upsert_place(マイグレーション 10)経由のみ。
--   直接書込はポリシー不在により RLS で常に拒否される(認証済ユーザーによる
--   任意行の座標汚染を構造的に封鎖)
-- DELETE ポリシーは作らない(他ユーザーが参照中の可能性)

-- =============================
-- saved_places: 自分のレコードのみアクセス可能
-- =============================
create policy "saved_places_select_own" on public.saved_places
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "saved_places_insert_own" on public.saved_places
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "saved_places_update_own" on public.saved_places
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "saved_places_delete_own" on public.saved_places
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- =============================
-- Data API 到達権限の明示 GRANT
-- =============================
-- 新規 Supabase プロジェクト(2026-05-30 以降)の既定では、public の新規テーブルは
-- Data API から到達不能(GRANT の自動付与なし=fail-closed)。
-- RLS ポリシーの鏡像として authenticated に最小権限で明示 GRANT する。
-- anon には一切付与しない(認証専用アプリ)。
-- places は書込ポリシーを持たないため GRANT も SELECT のみ(鏡像原則。
-- 書込は SECURITY DEFINER 関数=所有者権限で行われ、呼び出し元の GRANT は不要)。
-- service_role は保守・管理経路用(サーバ専用・クライアント非露出。
-- アプリの一般クエリでは使用しない)。

grant usage on schema public to authenticated, service_role;

grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.user_agreements to authenticated;
grant select on public.places to authenticated;
grant select, insert, update, delete on public.saved_places to authenticated;

grant all on public.profiles, public.user_agreements, public.places, public.saved_places to service_role;
