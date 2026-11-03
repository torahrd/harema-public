-- =============================
-- login-replace(2/3): 利用者 ID を text にし、auth.users の外部キーを外し、全 policy を作り直す
-- =============================
-- Firebase の uid は 28 文字の英数字で uuid ではない。uuid を前提にした auth.uid() は 22P02 になるため、
-- 利用者 ID の列を text にし、policy は JWT の sub(auth.jwt() ->> 'sub')と private.session_ok() で守る。
-- 旧い policy は参照している列の型を変えられないので、先に全て drop する。

-- ===== 1. 既存の policy を全て落とす(10 本) =====
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "user_agreements_select_own" on public.user_agreements;
drop policy if exists "user_agreements_insert_own" on public.user_agreements;
drop policy if exists "places_select_authenticated" on public.places;
drop policy if exists "saved_places_select_own" on public.saved_places;
drop policy if exists "saved_places_insert_own" on public.saved_places;
drop policy if exists "saved_places_update_own" on public.saved_places;
drop policy if exists "saved_places_delete_own" on public.saved_places;

-- ===== 2. auth.users への外部キーを全て外す =====
-- 制約名を決め打ちせず、auth.users を参照する外部キーをカタログから拾って外す
-- (profiles.id / user_agreements.user_id / saved_places.user_id / ogp_fetch_attempts.user_id の 4 本)。
-- saved_places.place_id の places への外部キーは残る。
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl, c.conname
      from pg_constraint c
     where c.contype = 'f'
       and c.confrelid = 'auth.users'::regclass
       and c.conrelid in (
         'public.profiles'::regclass,
         'public.user_agreements'::regclass,
         'public.saved_places'::regclass,
         'public.ogp_fetch_attempts'::regclass
       )
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end;
$$;

-- ===== 3. 利用者 ID の 4 列を text にする =====
alter table public.profiles alter column id type text using id::text;
alter table public.user_agreements alter column user_id type text using user_id::text;
alter table public.saved_places alter column user_id type text using user_id::text;
alter table public.ogp_fetch_attempts alter column user_id type text using user_id::text;

comment on table public.profiles is
  'ユーザー固有設定(Firebase の uid と 1:1)。規約同意完了時に complete_onboarding で INSERT';
comment on column public.profiles.id is
  'Firebase の uid(text)。ID トークンの sub と一致する。auth.users への外部キーは持たない';
comment on column public.user_agreements.user_id is
  'Firebase の uid(text)。ID トークンの sub と一致する。auth.users への外部キーは持たない';
comment on column public.saved_places.user_id is
  'Firebase の uid(text)。ID トークンの sub と一致する。auth.users への外部キーは持たない';
comment on column public.ogp_fetch_attempts.user_id is
  'Firebase の uid(text)。ID トークンの sub と一致する。auth.users への外部キーは持たない';

-- ===== 4. policy を作り直す(10 本・全て private.session_ok() を条件に持つ) =====
-- (select …) で包むのは、行ごとに評価されず 1 文につき 1 回の評価(initplan)になるようにするため。
-- 判定が偽(role なし・期限切れ・失効・project 違い)なら、どの policy も通らず 0 行・書込は拒否される。

-- profiles: 自分のレコードのみ
create policy "profiles_select_own" on public.profiles
  for select
  to authenticated
  using ((select private.session_ok()) and id = (select auth.jwt() ->> 'sub'));

create policy "profiles_insert_own" on public.profiles
  for insert
  to authenticated
  with check ((select private.session_ok()) and id = (select auth.jwt() ->> 'sub'));

create policy "profiles_update_own" on public.profiles
  for update
  to authenticated
  using ((select private.session_ok()) and id = (select auth.jwt() ->> 'sub'))
  with check ((select private.session_ok()) and id = (select auth.jwt() ->> 'sub'));

-- DELETE ポリシーは作らない(退会は delete_my_account() だけが消す)

-- user_agreements: 自分のレコードのみ SELECT / INSERT
create policy "user_agreements_select_own" on public.user_agreements
  for select
  to authenticated
  using ((select private.session_ok()) and user_id = (select auth.jwt() ->> 'sub'));

create policy "user_agreements_insert_own" on public.user_agreements
  for insert
  to authenticated
  with check ((select private.session_ok()) and user_id = (select auth.jwt() ->> 'sub'));

-- places: 有効なログインなら全件 SELECT のみ(共有キャッシュ・書込の policy は作らない)
create policy "places_select_authenticated" on public.places
  for select
  to authenticated
  using ((select private.session_ok()));

-- saved_places: 自分のレコードのみ
create policy "saved_places_select_own" on public.saved_places
  for select
  to authenticated
  using ((select private.session_ok()) and user_id = (select auth.jwt() ->> 'sub'));

create policy "saved_places_insert_own" on public.saved_places
  for insert
  to authenticated
  with check ((select private.session_ok()) and user_id = (select auth.jwt() ->> 'sub'));

create policy "saved_places_update_own" on public.saved_places
  for update
  to authenticated
  using ((select private.session_ok()) and user_id = (select auth.jwt() ->> 'sub'))
  with check ((select private.session_ok()) and user_id = (select auth.jwt() ->> 'sub'));

create policy "saved_places_delete_own" on public.saved_places
  for delete
  to authenticated
  using ((select private.session_ok()) and user_id = (select auth.jwt() ->> 'sub'));

-- 表の GRANT は変えない(20260729000001 の宣言のまま。列の型の変更で ACL は動かない)。
notify pgrst, 'reload schema';
