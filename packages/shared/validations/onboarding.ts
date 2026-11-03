import { z } from 'zod'
import { usernameSchema } from './username'

/**
 * Onboarding 完了 Server Action の入力スキーマ。現状は username 単一フィールド。規約同意はボタン
 * 操作で表現し、値としては持たない(agreed_at は DB の default now() が唯一の真実源で、クライアント
 * 入力を真実源にしない)。username の検証ルール(`usernameSchema`)はクライアントの入力バリデーションと
 * 共有し、サーバは本スキーマで safeParse 再検証する(spec §8)。
 */
export const completeOnboardingSchema = z.object({
  username: usernameSchema,
})
