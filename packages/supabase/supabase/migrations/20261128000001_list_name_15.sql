-- リストの名前の上限を 30 字から 15 字にする(マイグレーション 28)。
--
-- 所有者の決定(2026-11-26 00:56 JST・harema#152): 11-29 の公開の値は、名前に入れられる字の数 15。
-- 22 本目(20261115000001_create_lists.sql)は公開済みで変えない。ここで public.lists の名前の CHECK(lists_name_check)だけを替える。
--   - 制約の名前は lists_name_check(22 本目が列に付けた名前なしの CHECK に PostgreSQL が付けた名前)。アイコンの lists_icon_check(32)は変えない。
--   - 1 文(drop constraint と add constraint を同じ alter table に置く)で替える。途中で失敗しても、制約が無い瞬間や 2 つある状態が残らない。
--   - NOT VALID にしない。public.lists は小さい表で、分けて強いロックの時間を短くする利点が無い。NOT VALID のまま残すと、長い名前の行はアイコンだけの update も落ちる。
--   - drop constraint if exists にしない。本番の制約の名前が違った時に、黙って 2 つ目の制約を足さず、失敗して止まるため。
--   - 長さは char_length(コードポイント)で数える(22 本目と同じ)。
-- 注意: 15 字を超える名前の行が 1 行でもあると、この migration は失敗する(制約は 30 のまま残る)。
--   当てる前に docs/verification/R2-push9.md の M-3 で 0 件を確かめる。migration の中で名前を切り詰める処理は入れない(持ち主の付けた名前を勝手に縮めない)。
-- 既にある行(15 字以下)はそのまま残る。後で上限を上げても、付けた名前は残る。
-- 列の注記(comment on column)も 15 に書き直す。22 本目の注記が 30 のまま残ると、DB を読む人が上限を 30 と読む。
-- 関数・トリガー・policy・grant・型は変えない(列も型も変わらない。SECURITY DEFINER も新しい表も無い)。
-- 写し(同じ値を書く所): packages/shared/constants/limits.ts の LIST_NAME_MAX_LENGTH・ja/en の web.lists.nameHelp の文。
--   次に名前の上限を変えるときは、新しい migration で制約を替え、この 3 つを合わせる。
alter table public.lists
  drop constraint lists_name_check,
  add constraint lists_name_check check (char_length(name) between 1 and 15);

comment on column public.lists.name is 'リストの名前。1〜15 文字(char_length 基準)。不可視の文字の拒否は shared の Zod';
