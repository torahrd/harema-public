import { z } from 'zod'

/**
 * ログインの画面を経た目印。`POST /auth/session` の本文の `agreed`(`true` だけが目印)。
 * 同意した番号は本文に載せない。記録する番号は DB の `record_agreement()` が決める(呼ぶ側は番号も日時も渡さない)。
 * 目印もログインの画面の申告で、サーバは画面を経たことを確かめられない(docs/specification.md §6.1 の限界と同じ)。
 */
export const agreedMarkSchema = z.literal(true)
