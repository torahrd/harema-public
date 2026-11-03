-- =============================
-- 既存オブジェクトの過剰付与の是正(2026-07-29)
-- =============================
-- 経緯:
--   初回 `supabase db push` 直後の本番検証(docs/verification/R2-post-push.md)で、本番の 4 テーブルが
--   anon = arwdDxtm / authenticated = arwdDxtm、4 関数(SECURITY DEFINER 3 本 + set_updated_at)が
--   anon / authenticated / service_role へ EXECUTE を持つ状態だったことが判明した。
--   migration 8〜11 の明示 GRANT / REVOKE は書かれたとおりに実行されているが、それだけでは
--   過剰付与を取り除けなかった。
--
-- 出所:
--   本番プロジェクトの pg_default_acl(defaclrole = postgres / schema = public)が旧既定
--   —— tables に ALL、functions に EXECUTE を anon / authenticated / service_role へ —— を保持している。
--   PostgreSQL は CREATE 時にこの既定を明示 ACL エントリとして焼き付けるため、
--   migration 9〜11 の `revoke execute … from public` は PUBLIC エントリだけを外し、
--   明示された anon=X / authenticated=X / service_role=X は残った。テーブルも同様に、
--   `grant select … to authenticated` は既に全権がある上への追加であり、権限を減らす効果を持たない。
--
-- ローカルで再現しなかった理由:
--   ローカル CLI イメージの同じ既定は tables = Dxtm / sequences = w / functions = PUBLIC 既定のみで、
--   本番と異なる。ローカル pgTAP は本番の権限を予測しない(AGENTS.md に記録)。
--
-- 方針:
--   migration 1〜11 は本番 push 済みで凍結(CLAUDE.md §3)。中身は変えず additive に是正する。
--   差分(`revoke delete on … from authenticated` のような書き方)ではなく「あるべき ACL を宣言する」。
--   ローカル(anon=Dxtm)と本番(anon=arwdDxtm)は出発点が違うため、
--   `revoke all` → 契約どおり `grant` し直す形でのみ両環境の最終状態が一致する。
--
-- 意図的に触らないもの:
--   ・テーブルの service_role = ALL(migration 8 の明示契約。保守・管理経路)
--   ・テーブル / 関数の定義、RLS ポリシー(診断 4 = 健全)
--   ・enum 型 saved_place_status の PUBLIC USAGE(落とすと authenticated のクエリが壊れる)
--   ・schema public の PUBLIC USAGE(authenticator の introspection を巻き込み Data API を壊しうる)

-- =============================
-- テーブル:anon を 0 にし、authenticated を migration 8 の契約どおりに再宣言する
-- =============================
-- `revoke all` は TRUNCATE / REFERENCES / TRIGGER / MAINTAIN(Dxtm)も落とす。TRUNCATE は RLS を
-- 迂回して行フィルタなしにテーブル全体を消せるため、到達経路が将来増えたときに残す理由が無い。
-- `from public` は宣言を完全にするために含める(テーブルの PUBLIC 既定は空だが、本番の PUBLIC
-- エントリの有無は未実測。あっても無くてもこの 1 語で最終状態が確定する)。
revoke all on table public.profiles        from public, anon, authenticated;
revoke all on table public.user_agreements from public, anon, authenticated;
revoke all on table public.places          from public, anon, authenticated;
revoke all on table public.saved_places    from public, anon, authenticated;

-- migration 8 の GRANT の逐語(RLS ポリシーの鏡像)。
grant select, insert, update         on public.profiles        to authenticated;
grant select, insert                 on public.user_agreements to authenticated;
grant select                         on public.places          to authenticated;
grant select, insert, update, delete on public.saved_places    to authenticated;

-- =============================
-- 関数:EXECUTE を契約どおり {postgres, authenticated} / {postgres} に収束させる
-- =============================
-- service_role からも剥がす:migration 9 / 10 / 11 は service_role に EXECUTE を付与しておらず、
-- 契約は「無し」。service_role はテーブルに ALL + BYPASSRLS を持つので RPC を経由せず同じ結果を
-- 直接書けるため、剥がしても保守経路の能力を失わない。一方 cleanup_pending_users() は auth.users を
-- 物理削除するので、シークレット漏洩時に RPC 一発で未同意ユーザーを全消しできる経路は減らす。
revoke all on function public.upsert_place(text, numeric, numeric) from public, anon, authenticated, service_role;
revoke all on function public.complete_onboarding(text)            from public, anon, authenticated, service_role;
revoke all on function public.cleanup_pending_users()              from public, anon, authenticated, service_role;
revoke all on function public.set_updated_at()                     from public, anon, authenticated, service_role;

-- cleanup_pending_users() には grant を書かない(migration 9 の契約)。
-- pg_cron は関数所有者権限で実行するため、呼び出し元ロールへの EXECUTE は不要。
-- set_updated_at() にも grant を書かない。トリガー発火時に PostgreSQL は EXECUTE を再検査しない
-- ことをローカルで実測済み(2026-07-29。pgTAP 07_privilege_hardening.sql §8 が毎回検証する)。
-- これで「public 内のあらゆるオブジェクトに対し anon の到達は 0 件」が例外なしの不変条件になる。
grant execute on function public.upsert_place(text, numeric, numeric) to authenticated;
grant execute on function public.complete_onboarding(text)            to authenticated;

-- GRANT / REVOKE 後の PostgREST スキーマキャッシュ更新(リスナーが居なければ何も起きない no-op)。
notify pgrst, 'reload schema';
