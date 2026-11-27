-- privacy-revision-4: プライバシーポリシーの 4 回目の改定(リストとリストに入れた店を、保存する情報に加える)の行を足す(26 本目)。
--
-- 何を: private.legal_revisions に ('privacy', 4) の 1 行を足す。それだけ(表・関数・policy・grant は変えない)。
--   - 最終改定日 2026.11.29・適用 2026-11-29 午前 0 時(日本標準時 = 2026-11-28T15:00:00Z)・notice 真・builtin_text 偽。
--   - 効くもの(25 本目が持つ仕組みが、この 1 行で動き出す):
--       private.lists_ok() が、適用の日時の後に限り、番号 4 以上に同意した人にだけ真になる(リストの門が開く)。
--       agreement_state() が、番号 4 に満たない人に、この行の notice_ja・notice_en を出す(お知らせ → 「続ける」→ agree_current)。
--       current_agreement()(iOS 2.0.0・今の本番の web)は builtin_text 偽のこの行を数えない。record_agreement() は 3 で止める。
--   - 適用の日時は、掲示(2026.11.25)から 3 日以上後(第 12 条 2 項・3 項)。0 時ちょうどに、デプロイも再起動もなしで効く(DB の now() の比べ)。
-- 写し(同じ値を書く所。照合は apps/mobile/src/auth/test/legal-versions.test.mjs の T-9 が見る):
--   packages/shared/constants/legal-versions.ts の LEGAL_REVISIONS.privacy の 4 行目・docs/legal/privacy.md(最終改定日)・
--   apps/web/src/app/_public/news.ts の after.at。
-- お知らせの文(notice_ja・notice_en)は、日付の文の 1 段落だけ(この 2 つの配列が正本。クライアントは写さない)。日付は {date} と書き、
--   クライアントが agreement_state() の notice_effective_on(effective_at の日本標準時の暦日 = 2026.11.29)で埋める。
--   改定の中身は、DB でなく web の apps/web/src/app/_public/news.ts の `notice` を持つ件(LP の更新情報の 1 件)の文を、
--   地図の改定のお知らせの枠に出す(決定 2026-11-25 22:56 JST・harema#152 コメント 7164529219)。
--   iOS の枠の形は未決: 次の iOS のビルドはお知らせが日付の文だけになる(iOS 2.0.0 は builtin_text 偽のこの行を出さないので、11-29 の公開には効かない)。
--   差し替えるときは、この 2 つの配列の文だけを直す(適用の日時の前なら新しい migration で update)。
-- 当てた後に適用の日を動かすときは、effective_at・revised_on を update する新しい migration 1 本と、写しの 3 か所の直し。
-- 公開済みの migration は書き換えない(新規 1 本)。

insert into private.legal_revisions (doc, version, revised_on, effective_at, notice, builtin_text, notice_ja, notice_en) values
  ('privacy', 4, date '2026-11-29', timestamptz '2026-11-29 00:00:00+09', true, false,
   array['プライバシーポリシーを、{date} に改定しました。'],
   array['We updated the Privacy Policy on {date}.']);
