import { z } from 'zod'

/**
 * Firebase の JS SDK が永続化(React Native では Keychain)に書く利用者の値(`user.toJSON()` の JSON)のうち、
 * 共有の拡張が読む 2 つだけ。余分の項目は無視する(`z.object` は未知のキーを落とす)。
 * 形が違えば読めない = 「ログインが要る」へ倒す。
 */
export const firebaseStoredUserSchema = z.object({
  uid: z.string().min(1),
  stsTokenManager: z.object({
    refreshToken: z.string().min(1),
  }),
})

export type FirebaseStoredUser = z.infer<typeof firebaseStoredUserSchema>
