import 'server-only'

import { serverEnvSchema } from '@harema/shared/validations'
import { assertNoOverridesOnVercel } from '@/lib/auth/env-guard'
import { parseSessionKeys } from '@/lib/auth/core'

/**
 * サーバ専用 env。Supabase の secret は places の書込(lib/supabase/admin.ts)でのみ、Places のサーバ
 * 専用キーは保存時の Place Details(lib/places/details.ts)でのみ、セッション cookie の暗号鍵は
 * lib/auth/ でのみ使う。'server-only' でクライアントバンドルへの混入を構造的に禁じる
 * (どれも公開 prefix を持たない)。サーバに Firebase の管理の鍵は置かない。
 * 値は module scope で初回 import 時に検証する。検証失敗は実際の環境変数名で throw する(値は出さない)。
 */
const SCHEMA_KEY_TO_ENV_VAR: Record<string, string> = {
  supabaseSecretKey: 'SUPABASE_SECRET_KEY',
  googlePlacesApiKey: 'GOOGLE_PLACES_API_KEY',
  sessionEncryptionKeys: 'SESSION_ENCRYPTION_KEYS',
  firebaseAuthOriginOverride: 'FIREBASE_AUTH_ORIGIN_OVERRIDE',
  firebaseX509UrlOverride: 'FIREBASE_X509_URL_OVERRIDE',
  cronSecret: 'CRON_SECRET',
}

// 上書きの env が本番(Preview を含む VERCEL の環境)に入ると、署名の検証が別の鍵に向く
assertNoOverridesOnVercel(process.env)

const parsed = serverEnvSchema.safeParse({
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY,
  sessionEncryptionKeys: process.env.SESSION_ENCRYPTION_KEYS,
  firebaseAuthOriginOverride: process.env.FIREBASE_AUTH_ORIGIN_OVERRIDE,
  firebaseX509UrlOverride: process.env.FIREBASE_X509_URL_OVERRIDE,
  cronSecret: process.env.CRON_SECRET,
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

// 形(鍵 id と base64 の 32 byte)も起動時に確かめる。例外の文には値を入れない
try {
  parseSessionKeys(parsed.data.sessionEncryptionKeys)
} catch {
  throw new Error('Invalid or missing environment variable(s): SESSION_ENCRYPTION_KEYS')
}

export const serverEnv = parsed.data
