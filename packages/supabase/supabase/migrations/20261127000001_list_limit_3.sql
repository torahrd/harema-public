-- 1 人のリストの数の上限を 100 から 3 にする(マイグレーション 27)。
--
-- 所有者の決定(2026-11-26 00:04 JST・harema#152): 11-29 の公開の値は 1 人 3 個まで。
-- 22 本目(20261115000001_create_lists.sql)は公開済みで変えない。ここで関数 private.enforce_list_limit() だけを置き換える。
-- 変えるのは上限の数(>= 100 → >= 3)と detail(max=100 → max=3)だけ。本体の残りは 22 本目と同じ。
--   - SECURITY INVOKER(既定)のまま。security definer は書かない。
--   - search_path は空に固定する(create or replace は書いた設定で置き換わるので省かない)。
--   - 利用者ごとの advisory lock も 22 本目のまま。
--   - エラーは SQLSTATE 54000・message `list_limit_exceeded`・detail `max=3`。
-- トリガー trg_lists_limit は同じ関数を指したままなので、作り直さない。表・policy・grant・型も変えない。
-- 既にある行は消えない: トリガーは insert だけを見るので、3 個を超えて持つ人は、3 個未満に減らすまで新しく作れないだけ。
-- 写し: packages/shared/constants/limits.ts の LIST_MAX_PER_USER と、ja/en の web.lists.limit の文。
--   次に上限を変えるときは、新しい migration で関数を置き換え、この 3 つを合わせる。
create or replace function private.enforce_list_limit()
returns trigger
language plpgsql
set search_path = ''
as $f$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lists:' || new.user_id, 0));
  if (select pg_catalog.count(*) from public.lists l where l.user_id = new.user_id) >= 3 then
    raise exception 'list_limit_exceeded' using errcode = '54000', detail = 'max=3';
  end if;
  return new;
end
$f$;
revoke all on function private.enforce_list_limit() from public, anon, authenticated, service_role;
