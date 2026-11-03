import { NextResponse, type NextRequest } from 'next/server'
import { clientEnv } from '@/env/client'
import {
  SESSION_COOKIE_NAME,
  acceptLogin,
  sessionCookieAttributes,
} from '@/lib/auth/core'
import { verifyFirebaseIdToken } from '@/lib/auth/firebase'
import { getSessionKeys, isSecureCookie } from '@/lib/auth/session'

const NO_STORE = { 'Cache-Control': 'no-store' }
const BODY_LIMIT = 8192

/**
 * ブラウザが Firebase にログインした直後に ID トークンと更新用の鍵を渡す口(形 C)。
 * Origin が `NEXT_PUBLIC_APP_URL` と一致・JSON の Content-Type・署名と iss・aud・期限が正しく・
 * auth_time が 5 分以内のときだけ、暗号化した cookie を張る。判定は core の `acceptLogin`。
 * 全ての応答に `Cache-Control: no-store`。拒否の応答に `Set-Cookie` は載せない。
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT) {
    return NextResponse.json({ ok: false, error: 'too_large' }, { status: 413, headers: NO_STORE })
  }
  const nowSec = Math.floor(Date.now() / 1000)
  const result = await acceptLogin(
    {
      origin: request.headers.get('origin'),
      contentType: request.headers.get('content-type'),
      bodyText: await request.text(),
    },
    {
      appUrl: clientEnv.appUrl,
      keys: getSessionKeys(),
      nowSec,
      verifyIdToken: (token, maxAuthAgeSec) => verifyFirebaseIdToken(token, maxAuthAgeSec),
    },
  )
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status, headers: NO_STORE })
  }
  const response = NextResponse.json({ ok: true, next: result.next }, { headers: NO_STORE })
  response.cookies.set(
    SESSION_COOKIE_NAME,
    result.value,
    sessionCookieAttributes({ secure: isSecureCookie(), session: result.session, nowSec }),
  )
  return response
}
