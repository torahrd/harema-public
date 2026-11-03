import { clientEnvSchema } from '@harema/shared/validations'

/**
 * クライアント公開 env。
 *
 * - `process.env.NEXT_PUBLIC_*` はリテラルのメンバ式で参照する。Next.js のビルド時
 *   インライン置換はこの形にしか効かないため(shared 側の動的参照に賭けない)。
 * - 値は module scope で初回 import 時に一度だけ検証する。これは不変値の検証であって、
 *   CLAUDE.md §3 が禁じる「Supabase クライアントの module scope 生成」ではない。
 * - process.env の直読みは env/ の外で行わない。新しい変数を使うときはスキーマに足して
 *   ここで詰める。
 * - 検証失敗は実際の環境変数名で throw する(スキーマキーだけだと原因が分かりにくいため)。
 */
const SCHEMA_KEY_TO_ENV_VAR: Record<string, string> = {
  supabaseUrl: 'NEXT_PUBLIC_SUPABASE_URL',
  supabasePublishableKey: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  appUrl: 'NEXT_PUBLIC_APP_URL',
  googleMapsApiKey: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
  googleMapsMapId: 'NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID',
  firebaseApiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
  firebaseAuthDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  firebaseProjectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  firebaseAuthEmulatorHost: 'NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST',
}

const parsed = clientEnvSchema.safeParse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  googleMapsMapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
  firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  firebaseAuthEmulatorHost: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
})

if (!parsed.success) {
  const names = new Set<string>()
  for (const issue of parsed.error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string') {
      names.add(SCHEMA_KEY_TO_ENV_VAR[key] ?? key)
    }
  }
  throw new Error(
    `Invalid or missing environment variable(s): ${[...names].join(', ')}`,
  )
}

export const clientEnv = parsed.data

/** 開発ビルドか(env/ の外で process.env を直に読まないため、ここで 1 行だけ公開する)。 */
export const isDevBuild = process.env.NODE_ENV !== 'production'
