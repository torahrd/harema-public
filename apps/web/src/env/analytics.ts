import { webAnalyticsEnvSchema } from '@harema/shared/validations'

/**
 * 公開ページの解析の env(Google アナリティクス 4 の測定 ID)。値は秘密ではない(ページの HTML に平文で載る)。
 * client.ts と分けるのは、公開ページが Supabase・Firebase の env を読まずに済むようにするため。
 *
 * 本番(Vercel の Production の build)は、所有者が作った hareMa のプロパティの ID を使う(2026-11-03 12:16 JST)。
 * env を足さずに push だけで本番に出せるよう、コードに置く。Preview と local は既定で送らない(本番の数字を汚さない)。
 * `NEXT_PUBLIC_GA_MEASUREMENT_ID` があれば、それを優先する(検査や別のプロパティへの切り替え)。
 * 形の違う値は build で落とす(打ち間違いのまま本番に出て、解析が黙って空になるのを防ぐ)。
 */
const PRODUCTION_GA_MEASUREMENT_ID = 'G-D9H5J51Y45'

const parsed = webAnalyticsEnvSchema.safeParse({
  gaMeasurementId:
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
    (process.env.VERCEL_ENV === 'production' ? PRODUCTION_GA_MEASUREMENT_ID : undefined),
})

if (!parsed.success) {
  throw new Error('Invalid environment variable(s): NEXT_PUBLIC_GA_MEASUREMENT_ID')
}

export const analyticsEnv = parsed.data
