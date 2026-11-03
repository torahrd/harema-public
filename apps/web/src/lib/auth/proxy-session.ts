import { NextResponse, type NextRequest } from 'next/server'
import {
  SESSION_COOKIE_NAME,
  clearedCookieAttributes,
  sessionCookieAttributes,
  updateSessionCookie,
} from './core'
import { fetchRefresh, verifyFirebaseIdToken } from './firebase'
import { getSessionKeys, isSecureCookie } from './session'

/**
 * proxy でのセッションの更新。ID トークンの残りが 5 分未満なら Firebase で取り直し、
 * 更新後の cookie をリクエスト側(後続の Server Component / Route Handler が読む)と
 * レスポンス側の両方へ反映する。分類(core の `updateSessionCookie`):
 * - 400(更新用の鍵の失効)・開けない cookie・預かって 30 日を過ぎた cookie → 消す。
 * - 通信の失敗・時間切れ・429・5xx → cookie を変えない(`Set-Cookie` を出さない)。
 *
 * ここでは DB の失効の判定をしない(要求ごとに DB を引かない)。判定は `getVerifiedUser()`。
 * cookie を書き換えた応答には `Cache-Control: no-store` を載せる。
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const raw = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!raw) return NextResponse.next({ request })

  try {
    const nowSec = Math.floor(Date.now() / 1000)
    const { session, change } = await updateSessionCookie(raw, {
      keys: getSessionKeys(),
      nowSec,
      fetchRefresh,
      verifyIdToken: (token) => verifyFirebaseIdToken(token),
    })
    if (change.kind === 'none') return NextResponse.next({ request })

    if (change.kind === 'clear') {
      request.cookies.delete(SESSION_COOKIE_NAME)
      const response = NextResponse.next({ request })
      response.cookies.set(SESSION_COOKIE_NAME, '', clearedCookieAttributes(isSecureCookie()))
      response.headers.set('Cache-Control', 'no-store')
      return response
    }

    // change.kind === 'set': session は取り直した後の中身
    request.cookies.set(SESSION_COOKIE_NAME, change.value)
    const response = NextResponse.next({ request })
    response.cookies.set(
      SESSION_COOKIE_NAME,
      change.value,
      sessionCookieAttributes({ secure: isSecureCookie(), session: session ?? { ts: nowSec }, nowSec }),
    )
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch {
    // 更新の失敗で全ての要求を止めない。認可は getVerifiedUser() が毎回判定する
    return NextResponse.next({ request })
  }
}
