-- =============================
-- 既定権限(pg_default_acl)の是正 —— 将来オブジェクトの再発防止(2026-07-29 / 2026-07-30 改訂)
-- =============================
-- 20260729000001 は「既に作られたオブジェクト」を直す。こちらは「これから作られるオブジェクト」を
-- 直す。本番の pg_default_acl(defaclrole = postgres / schema = public)には旧既定
-- (tables / sequences / functions を anon・authenticated・service_role へ付与)が残っており、
-- 放置すると次に public へ追加するテーブル・関数に同じ過剰付与が焼き付く。
--
-- 別ファイルにしてある理由は失敗の分離。`supabase db push` はファイル単位で適用するため、
-- こちらが失敗しても緊急度の高い 20260729000001 は既にコミット済みになる。
--
-- `for role postgres` を明示する理由:
--   本番 ACL の grantor が postgres であることは実測済み。明示しておけば、将来実行ロールが変わったとき
--   黙って別ロールの既定を書き換えるのではなくエラーで止まる(fail-closed)。
--
-- -----------------------------------------------------------------------------
-- ALTER DEFAULT PRIVILEGES は `IN SCHEMA` の有無で意味が変わる(PostgreSQL 17 公式ドキュメント)
-- -----------------------------------------------------------------------------
-- per-schema 形(`IN SCHEMA` 付き)—— sql-alterdefaultprivileges.html の逐語:
--   "Default privileges specified per-schema are added to the global default privileges for that
--    object type. Consequently, you cannot revoke privileges at the schema level if they have
--    already been granted globally; a per-schema REVOKE is only effective for reversing a previous
--    per-schema GRANT."
--   "This command has no effect unless undoing a matching GRANT. Per-schema default privileges can
--    only add privileges to the global setting, not remove them."
--   つまり per-schema 形の REVOKE では hard-wired の PUBLIC EXECUTE 既定を落とせない。
--   打ち消せるのは「直前の per-schema GRANT」だけ。
--
-- global 形(`IN SCHEMA` なし)—— 同ページの逐語:
--   "Removes the default public EXECUTE permission on functions subsequently created by a specific
--    role."(例示は ALTER DEFAULT PRIVILEGES FOR ROLE admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC)
--   ddl-priv.html も「default privileges … can be revoked in the same transaction that creates the
--   object, or overridden globally using the ALTER DEFAULT PRIVILEGES command」と書いている。
--
-- -----------------------------------------------------------------------------
-- 実測したこと / していないこと(2026-07-30・ローカル PostgreSQL 17.6)
-- -----------------------------------------------------------------------------
-- 生出力は docs/verification/R2-fix.md §0(すべて txn + rollback で取得し、前後の状態一致も示してある)。
-- 実測したこと:
--   ・global 形を打つと pg_default_acl に defaclnamespace = 0 の行 {postgres=X/postgres} が作られ、
--     直後に public へ作った関数は proacl = {postgres=X/postgres}(NULL でない)・anon の EXECUTE = false
--   ・同じ狙いを per-schema 形で打つと行は作られず、新規関数は proacl = NULL・anon の EXECUTE = true
--     (2026-07-29 の観測の再現)
--   ・global 形の `revoke all on functions from public` と `revoke execute on functions from public` は同結果
--   ・global 形の `revoke all on tables / sequences / functions from anon, authenticated, service_role` は
--     ローカルでは行を作らない(hard-wired 既定がこれらに何も与えていないため no-op)
-- 実測していないこと:
--   ・この 2 本が本番の既定を実際に上書きすること。ローカルと本番は pg_default_acl の出発点が違うので、
--     ローカルの緑は本番の証拠にならない。唯一の証拠は push 直後の本番 SQL 再実行
--     —— docs/verification/R2-fix.md §1 / §2(完了条件 P-4 / P-6)
--
-- -----------------------------------------------------------------------------
-- 影響範囲(global 形の代償・受容した残余リスク)
-- -----------------------------------------------------------------------------
--   ・global 形は postgres が作る関数に効くので、影響は public に限らない。別スキーマへ作った新規関数でも
--     anon の EXECUTE = false になることを実測した
--   ・ただし本環境の `create extension` はオブジェクト所有者が supabase_admin になるため、postgres の
--     既定は適用されない(global 形を打った状態で pgtap を作り、1079 関数のうち authenticated が
--     EXECUTE できないものが 0 件であることを実測)。すべての拡張がそうなるかは測っていない
--   ・壊れ方は 42501 で観測でき、`grant execute on all functions in schema <n> to public;` で追補でき、
--     この migration 自体も additive に取り消せる
--   ・defaclrole = supabase_admin 側の既定は変更しない —— postgres が supabase_admin のメンバーである
--     保証が無く、失敗すればマイグレーション全体が abort する。かつ supabase_admin の既定は supabase_admin が
--     作ったオブジェクトにしか効かず、本プロジェクトの 4 テーブル / 4 関数の所有者は postgres なので対象外。
--     顕在化の条件は「public に supabase_admin 所有のオブジェクトが現れること」で、検知は
--     docs/verification/R2-fix.md §2 の新 SQL 8(所有者列)と診断 5 の差分監視が担う
--
-- 既存オブジェクトには一切影響しない(PostgreSQL の仕様。既存分は 20260729000001 が担う)。
-- 副作用として、今後 Studio の Table Editor 等で public にテーブルを作っても Data API からは
-- 見えなくなる(明示 GRANT が要る)。これは意図した fail-closed。

-- =============================
-- (1) per-schema:本番の過剰付与が per-schema エントリなら、これでしか打ち消せない
-- =============================
-- global 形の REVOKE は per-schema エントリを消さない(per-schema は global への「追加」なので、
-- 追加を外せるのは同じ per-schema 形だけ)。したがって (2)(3) とは代替関係ではなく併用関係であり、
-- global 形を入れてもこの 3 文を消してはならない。
alter default privileges for role postgres in schema public
  revoke all on tables    from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

-- =============================
-- (2) global:hard-wired の「PUBLIC に EXECUTE」既定を override する
-- =============================
-- これが無いと、public に関数を追加するたび `revoke execute … from public;` を書く人間の規律だけが
-- 防御になる。2026-07-29 に判明した穴は、その規律を守っていて(migration 9 / 10 / 11 は
-- revoke execute … from public を書いていた)なお空いた。規約ではなく構造で閉じる。
alter default privileges for role postgres
  revoke execute on functions from public;

-- =============================
-- (3) global:本番の過剰付与が global 行(defaclnamespace = 0)側だった場合の防御
-- =============================
-- どちら側にあるかは是正前の本番 pg_default_acl を読むまで確定できない(push 前に診断 5 で 1 回だけ
-- 記録する = 完了条件 P-9。是正後は revoke で消えて読み取れなくなる)。per-schema 側にしか無ければ
-- この 3 文は行を作らない no-op(ローカルで実測済み)。コストほぼゼロで未実測の分岐を 1 つ潰す。
alter default privileges for role postgres
  revoke all on tables    from anon, authenticated, service_role;

alter default privileges for role postgres
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges for role postgres
  revoke all on functions from anon, authenticated, service_role;

-- =============================
-- (4) per-schema・from public:本番に per-schema の GRANT to PUBLIC があった場合にだけ効く
-- =============================
-- per-schema 形の REVOKE は「直前の per-schema GRANT の打ち消し」専用なので、そういう GRANT が
-- 無ければ no-op。hard-wired 既定を閉じているのは (2) であって、この文ではない。
alter default privileges for role postgres in schema public
  revoke all on functions from public;

-- types(enum saved_place_status 等)には触らない。PUBLIC USAGE を剥がすと authenticated のクエリが壊れる。
