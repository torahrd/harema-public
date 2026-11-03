import { z } from 'zod'

/**
 * env スキーマは prefix 非依存のキー(supabaseUrl 等)で定義する。実際の環境変数名は各アプリが
 * 自分の公開 prefix(Web / Mobile で異なる)やサーバ専用の秘密鍵名でリテラル参照して詰めて渡す。
 * shared には変数名を一切持たせない —— これにより Web/Mobile の prefix 分割が自然に表現でき、
 * サーバ専用の秘密鍵が Mobile 側に渡らないことを構造で保証する。
 *
 * ここには「今コードが消費している変数」だけを載せる。将来の項目は、それを使う WP が
 * 部品を 1 つ足してアプリ側のスキーマに組み込む(消費 = スキーマ追加を同一操作にする)。
 *
 * **アプリごとにスキーマを分ける理由**(2026-08-06・モバイル調査 S11 で確定):
 * 単一の `clientEnvSchema` に「消費したら required で 1 行足す」方式は、アプリが 1 つのときは
 * 正しく働くが、2 つになると「誰にとっての required か」が決まらなくなる。実際に食い違うのは:
 *
 * - `googleMapsMapId` —— **Mobile は使わない。** Map ID を付けた瞬間、無料 SKU(`Maps SDK`)から
 *   従量 SKU(`Dynamic Maps`)へ移る(公式の SKU 適用条件は逐語 "not loaded with a map ID")。
 *   Mobile はインライン JSON スタイリングで配色を当てるので Map ID を持たない
 * - `googleMapsApiKey` —— **Mobile ではランタイムの client env ではない。** ネイティブでは
 *   config plugin 経由で**ビルド時**にネイティブ設定へ入り、JS バンドルは読まない
 *   (→ `mobileBuildEnvSchema`)
 *
 * したがって**フィールド定義を部品にし、アプリごとに合成する。** どのアプリのスキーマも
 * 自分の集合は**全部 required** に保つ(片方の都合で他方の必須を緩めない)。
 */

// ── フィールド部品(定義はここ 1 箇所) ────────────────────────────────
const supabaseUrl = z.url()
const supabasePublishableKey = z.string().min(1)
const appUrl = z.url()
const googleMapsApiKey = z.string().min(1)
const googleMapsMapId = z.string().min(1)
// 空文字は「未設定」として扱う(.env に名前だけ書いた行が検証で落ちないように)
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)
// Firebase(Web の公開設定。ブラウザへ出てよい値)。ログインの置き換え(login-replace)で足した
const firebaseApiKey = z.string().min(1)
const firebaseAuthDomain = z.string().min(1)
const firebaseProjectId = z.string().min(1)
/** local の検査だけ。ブラウザの SDK を発行の口へ向ける。本番では設定しない。 */
const firebaseAuthEmulatorHost = z.preprocess(emptyToUndefined, z.url().optional())
/**
 * Google の iOS の OAuth client ID(`<数字>-<英数>.apps.googleusercontent.com`)。秘密ではない
 * (native のアプリに埋め込まれ、逆順の形は Info.plist の URL scheme に平文で入る)。任意。
 */
const googleIosClientId = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/)
    .optional(),
)

// ── Web(ブラウザへ公開されるランタイム env) ──────────────────────────
export const webClientEnvSchema = z.object({
  supabaseUrl,
  supabasePublishableKey,
  appUrl,
  googleMapsApiKey,
  googleMapsMapId,
  firebaseApiKey,
  firebaseAuthDomain,
  firebaseProjectId,
  firebaseAuthEmulatorHost,
})

/**
 * `webClientEnvSchema` の別名。
 *
 * `apps/web/src/env/client.ts` がこの名前で import しているため、**web を無改修に保つために残す**。
 * web 側が `webClientEnvSchema` へ移行したら削除してよい(別名なので挙動は完全に同一)。
 */
export const clientEnvSchema = webClientEnvSchema

// ── Mobile(JS バンドルへ載るランタイム env) ─────────────────────────
/**
 * Mobile のランタイム client env。
 *
 * **`googleMaps*` は入らない**(上のコメントのとおり、Map ID は使わず、API キーはビルド時の
 * ネイティブ設定 = `mobileBuildEnvSchema` の担当)。
 */
export const mobileClientEnvSchema = z.object({
  supabaseUrl,
  supabasePublishableKey,
  appUrl,
  // ネイティブの資格(Apple / Google)で Firebase の JS SDK に入るための公開設定。
  // authDomain は要らない(popup / redirect を使わない)ので足さない。
  firebaseApiKey,
  firebaseProjectId,
  /** local の検査だけ。dev のビルドでだけ受ける(読む側が `__DEV__` で縛る)。本番では設定しない。 */
  firebaseAuthEmulatorHost,
  /** Google のネイティブのログイン用。無いとき Google のボタンは押せない(リリースでは読む側が投げる)。 */
  googleIosClientId,
})

// ── Mobile(ビルド時にネイティブ設定へ入る。JS バンドルは読まない) ──────
/**
 * `app.config.ts`(ビルド時の Node)が読む Maps キー。**JS バンドルへは載せない**ので
 * `EXPO_PUBLIC_` prefix を付けない(付けると読む必要の無いものを露出させる)。
 *
 * **キーが 2 本必要なのは Google 側の制約で、選択の余地が無い** —— アプリケーション制限は
 * 排他で、公式逐語 "if you restrict the API key to only Android apps, you cannot use it with
 * iOS, web services, or JavaScript APIs"。したがって Android(package name + SHA-1)と
 * iOS(bundle ID)で別のキーになる。
 */
export const mobileBuildEnvSchema = z.object({
  googleMapsApiKeyAndroid: z.string().min(1),
  googleMapsApiKeyIos: z.string().min(1),
})

// ── サーバ専用(Web のサーバ側のみ。Mobile へは渡さない) ────────────────
export const serverEnvSchema = z.object({
  supabaseSecretKey: z.string().min(1),
  googlePlacesApiKey: z.string().min(1),
  /** セッション cookie の暗号鍵。`<鍵 id>:<base64 の 32 byte>` のカンマ区切り(先頭が現用)。形は web が検証する。 */
  sessionEncryptionKeys: z.string().min(1),
  /** local の検査だけ。Firebase の口の origin を発行の口へ向ける。`VERCEL` のある環境では起動を失敗させる。 */
  firebaseAuthOriginOverride: z.preprocess(emptyToUndefined, z.url().optional()),
  /** local の検査だけ。公開鍵(x509)の一覧の取得先。同上。 */
  firebaseX509UrlOverride: z.preprocess(emptyToUndefined, z.url().optional()),
  /**
   * 定期の取り直しの口(`/api/cron/refresh-places`)の照合に使う。Vercel の Production だけ。無い・短いときは口が 401 で何もしない。
   * 長さの下限(32)はここに入れない(短い値の入れ間違いでサイト全体の起動を落とさない)。下限は口で見る。
   */
  cronSecret: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
})

export type WebClientEnv = z.infer<typeof webClientEnvSchema>
/** `WebClientEnv` の別名(`clientEnvSchema` と同じ理由で残している)。 */
export type ClientEnv = WebClientEnv
export type MobileClientEnv = z.infer<typeof mobileClientEnvSchema>
export type MobileBuildEnv = z.infer<typeof mobileBuildEnvSchema>
export type ServerEnv = z.infer<typeof serverEnvSchema>
