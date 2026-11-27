import { NextResponse, type NextRequest } from 'next/server'
import { clientEnv } from '@/env/client'
import {
  SESSION_COOKIE_NAME,
  acceptLogin,
  sessionCookieAttributes,
} from '@/lib/auth/core'
import { agreedMarkSchema } from '@harema/shared/validations'
import { recordAgreement } from '@/lib/auth/agreement'
import { verifyFirebaseIdToken } from '@/lib/auth/firebase'
import { getSessionKeys, isSecureCookie } from '@/lib/auth/session'
import { localeSchema } from '@harema/shared/i18n'
import { refreshLocaleCookie } from '@/i18n/locale-cookie'

const NO_STORE = { 'Cache-Control': 'no-store' }
const BODY_LIMIT = 8192

/**
 * ブラウザが Firebase にログインした直後に ID トークンと更新用の鍵を渡す口(形 C)。
 * Origin が `NEXT_PUBLIC_APP_URL` と一致・JSON の Content-Type・署名と iss・aud・期限が正しく・
 * auth_time が 5 分以内のときだけ、暗号化した cookie を張る。判定は core の `acceptLogin`。
 * 本文の `agreed` は、ログインの画面を経た目印(`true` だけ)。目印が在れば、cookie の値を作れた後に、DB の `agree_current()` を引数なしで呼ぶ(番号も日時も DB が決める。失敗・遅れはログインを止めない)。
 * 本文の `locale` は、ログイン画面で選んだ言語(任意)。言語の cookie は同意の記録に成功した時だけ書く。
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
      // 同意の記録(目印の形は shared の Zod・書き込みは検証済みの ID トークンで DB の関数を呼ぶ)。失敗はログインを止めない
      parseAgreed: (value) => agreedMarkSchema.safeParse(value).success,
      // 失敗の種類だけを残す(ID トークン・sub は出さない)。ログインは止めない
      recordAgreement: async (idToken) => {
        const outcome = await recordAgreement(idToken)
        if (outcome === 'failed') console.warn('[auth/session] record_agreement failed')
        return outcome
      },
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
  // 言語の cookie は、今のバージョンへの同意の記録に成功した(recorded か already)時だけ書く(拒否の応答・記録の失敗・skipped・目印が無い時は書かない。登録の前のログインも、同意前の行への記録に成功すれば書く)。
  // 書く値は、ログイン画面で選んだ言語(本文の locale を localeSchema で確かめた値)か、無ければ端末の cookie の値(期限を 1 年に延ばす)。
  const chosen = localeSchema.safeParse(result.requestedLocale)
  refreshLocaleCookie(
    request,
    response,
    isSecureCookie(),
    {
      agreed: result.agreement === 'recorded' || result.agreement === 'already',
      chosen: chosen.success ? chosen.data : null,
    },
  )
  return response
}
