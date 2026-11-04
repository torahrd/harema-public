import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@harema/supabase/types'
import { NextResponse } from 'next/server'
import { parseBearerAuthorization, type VerifiedUser } from '@/lib/auth/core'
import { createTokenSupabase, getVerifiedUserFromToken } from '@/lib/auth/session'
import {
  MOBILE_API_BODY_MAX_BYTES,
  readBoundedText,
  runMobileApi,
  type MobileApiResult,
} from './request-core'

/**
 * mobile 用の受け口(`app/api/mobile/v1` の下の各 route.ts)の包み。route はこれを通る(検査 LR-S8)。
 * 順の判断はここに書かない — 順は純粋な `runMobileApi`(`request-core.ts`)が持ち、試験で守られている。
 * ここは Request から header と本文を読み、`getVerifiedUserFromToken`・`createTokenSupabase` を渡し、
 * 戻りを `NextResponse.json` にするだけ。cookie は読まない・書かない。
 */

export type MobileApiHandlerContext = {
  user: VerifiedUser
  supabase: SupabaseClient<Database>
  body: unknown
}

export type MobileApiHandler = (context: MobileApiHandlerContext) => Promise<MobileApiResult>

export async function handleMobileApi(
  request: Request,
  handler: MobileApiHandler,
): Promise<Response> {
  const result = await runMobileApi(
    {
      method: request.method,
      contentType: request.headers.get('content-type'),
      authorization: request.headers.get('authorization'),
      // 本文は ID トークンの検証が通った後にだけ、上限を数えながら読む(runMobileApi が呼ぶ)
      readBody: () => readBoundedText(request.body, MOBILE_API_BODY_MAX_BYTES),
    },
    {
      parseBearer: parseBearerAuthorization,
      verifyToken: getVerifiedUserFromToken,
      createClient: createTokenSupabase,
      handler,
    },
  )
  return NextResponse.json(result.body, { status: result.status, headers: result.headers })
}
