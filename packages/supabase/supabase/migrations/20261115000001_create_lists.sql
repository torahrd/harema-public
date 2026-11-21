-- lists: 保存した店を利用者が自分のリストに分ける(段 2a)。
--
-- 表は 2 つ(1 店が複数のリストに入れる多対多)。
--   public.lists        … リスト本体(名前・アイコン)。持ち主は user_id(profiles への外部キー・on delete cascade)。
--   public.list_places  … リストと保存した店の対応。持ち主は lists から決まる(user_id の列は持たない)。
--
-- 公開しない: 公開の印の列・anon 向けの policy・公開用の関数は作らない(共有は段 2b で別の migration)。
-- 関数は 1 つだけ(リストの数の上限のトリガー関数・SECURITY INVOKER)。SECURITY DEFINER を新しく作らない。
-- 退会: 退会の削除は profiles を消すので、profiles への外部キー(cascade)でリストが消え、
--   リストの削除で対応が消える。既存の退会の関数(公開済みの migration)は書き直さない。
-- 外の表の列は policy の中で表の名前を付けて書く(後の migration が lists に list_id、saved_places に
--   saved_place_id という列を足しても、持ち主の確かめが別の意味にならない)。

-- =============================
-- 1. テーブル
-- =============================
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  icon text check (icon is null or char_length(icon) between 1 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_lists_user on public.lists (user_id, created_at);

create table public.list_places (
  list_id uuid not null references public.lists(id) on delete cascade,
  saved_place_id uuid not null references public.saved_places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, saved_place_id)
);
create index idx_list_places_saved_place on public.list_places (saved_place_id);

create trigger trg_lists_updated_at before update on public.lists
  for each row execute function public.set_updated_at();

-- 1 人のリストの数の上限(100)。登録済みの利用者が REST から行を送り続けて DB の容量を埋める損を塞ぐ
-- (mobile は RLS だけで DB に届くので、アプリ側の数えでは塞がらない)。100 は仮の上限(料金の段で見直す。
-- 変えるときは新しい migration で関数を置き換える)。
-- 関数は SECURITY INVOKER(既定)で足りる: 数えるのは呼び手自身の行で、lists の select の policy が本人の行を見せる。
--   DEFINER にすると、権限の高い関数を新しく足すことになり、search_path の固定と execute の revoke が要るので避ける。
--   それでも search_path は固定し(空)、execute は誰にも付けない(トリガーの発火時に EXECUTE は再検査されない。
--   public.set_updated_at と同じ)。schema private に置く(public の関数の数と ACL の契約を動かさない)。
-- 同時の挿入で上限を越えないよう、利用者ごとの advisory lock(トランザクションの終わりまで)で数えるのを直列にする。
-- エラー: SQLSTATE 54000(program_limit_exceeded)・message `list_limit_exceeded`・detail `max=100`。
--   名前・アイコンの長さの CHECK(23514)と区別でき、画面は SQLSTATE か message で文言に当てられる。
create function private.enforce_list_limit()
returns trigger
language plpgsql
set search_path = ''
as $f$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lists:' || new.user_id, 0));
  if (select pg_catalog.count(*) from public.lists l where l.user_id = new.user_id) >= 100 then
    raise exception 'list_limit_exceeded' using errcode = '54000', detail = 'max=100';
  end if;
  return new;
end
$f$;
revoke all on function private.enforce_list_limit() from public, anon, authenticated, service_role;
create trigger trg_lists_limit before insert on public.lists
  for each row execute function private.enforce_list_limit();

comment on table public.lists is '利用者が作るリスト(保存した店の分類)。本人だけが読み書きできる。profiles の削除に連なって消える';
comment on column public.lists.user_id is '持ち主(Firebase uid)。RLS は auth.jwt() の sub と一致する行だけ';
comment on column public.lists.name is 'リストの名前。1〜30 文字(char_length 基準)。不可視の文字の拒否は shared の Zod';
comment on column public.lists.icon is 'リストのアイコン(絵文字そのもの、または一覧の鍵)。null 可。DB は長さ(1〜32)だけを見る。中身は shared の Zod が検証する';
comment on table public.list_places is 'リストと保存した店(saved_places)の対応。user_id の列は持たず、持ち主は lists から決まる。UPDATE はできない';

-- =============================
-- 2. RLS(2 表とも有効・policy は 7 本・全部 authenticated 向け)
-- =============================
alter table public.lists enable row level security;
alter table public.list_places enable row level security;

create policy "lists_select_own" on public.lists for select to authenticated
  using ((select private.session_ok()) and lists.user_id = (select auth.jwt() ->> 'sub'));
create policy "lists_insert_own" on public.lists for insert to authenticated
  with check ((select private.session_ok()) and lists.user_id = (select auth.jwt() ->> 'sub'));
create policy "lists_update_own" on public.lists for update to authenticated
  using ((select private.session_ok()) and lists.user_id = (select auth.jwt() ->> 'sub'))
  with check ((select private.session_ok()) and lists.user_id = (select auth.jwt() ->> 'sub'));
create policy "lists_delete_own" on public.lists for delete to authenticated
  using ((select private.session_ok()) and lists.user_id = (select auth.jwt() ->> 'sub'));

create policy "list_places_select_own" on public.list_places for select to authenticated
  using (
    (select private.session_ok())
    and exists (
      select 1 from public.lists l
      where l.id = list_places.list_id and l.user_id = (select auth.jwt() ->> 'sub')
    )
  );
create policy "list_places_insert_own" on public.list_places for insert to authenticated
  with check (
    (select private.session_ok())
    and exists (
      select 1 from public.lists l
      where l.id = list_places.list_id and l.user_id = (select auth.jwt() ->> 'sub')
    )
    and exists (
      select 1 from public.saved_places s
      where s.id = list_places.saved_place_id and s.user_id = (select auth.jwt() ->> 'sub')
    )
  );
create policy "list_places_delete_own" on public.list_places for delete to authenticated
  using (
    (select private.session_ok())
    and exists (
      select 1 from public.lists l
      where l.id = list_places.list_id and l.user_id = (select auth.jwt() ->> 'sub')
    )
  );

-- =============================
-- 3. grant(宣言方式): anon と service_role には付けない
-- =============================
revoke all on table public.lists from public, anon, authenticated, service_role;
revoke all on table public.list_places from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.lists to authenticated;
grant select, insert, delete on table public.list_places to authenticated;

notify pgrst, 'reload schema';
