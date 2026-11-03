import { NextResponse, type NextRequest } from 'next/server'
import { clientEnv } from '@/env/client'
import { SESSION_COOKIE_NAME, clearedCookieAttributes } from '@/lib/auth/core'
import { parseWithdrawRequest, runWithdraw } from '@/lib/auth/account-core'
import { beginWithdrawal, finishWithdrawal } from '@/lib/auth/account'
import { deleteFirebaseAccount, verifyFirebaseIdToken } from '@/lib/auth/firebase'
import { getVerifiedUser, isSecureCookie } from '@/lib/auth/session'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * 退会(D4)。ブラウザが再認証(同じ provider で入り直し、Apple は取り消しも済ませる)で得た ID トークンを
 * 本文 `{idToken}` で受ける。cookie の中の ID トークンでは退会しない。
 *
 * 順(PLAN §0.3・改訂 5): Origin・Content-Type・本文の判定 → `getVerifiedUser()`(署名と DB の判定)→
 * 再認証のトークンの検証(署名・iss・aud・auth_time が 5 分以内・sub が cookie の sub と一致)→
 * `begin_withdrawal()`(退会の印と利用者単位の失効・失敗は 2 回まで再試行)→ Firebase の `accounts:delete` →
 * `finish_withdrawal()`(失敗は 2 回まで再試行)→ cookie を消す。判定と順は account-core の `runWithdraw`。
 * 2 つの RPC には再認証で得た ID トークンを渡す(cookie のトークンは 6 分以上前のことがある・cookie のトークンでは退会しない)。
 * 印の後の失敗(Firebase の削除・`finish_withdrawal()`)は完了を返して cookie を消す(毎時の削除が片付ける)。
 * 印を書けなかったときだけ失敗を返し、cookie を残す(何も消えていない・やり直せる)。
 * 削除対象はサーバが検証した ID の `sub` だけで、クライアント供給の ID を受けない。
 * 全ての応答に `Cache-Control: no-store`。拒否の応答に `Set-Cookie` を載せない。
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = parseWithdrawRequest(
    {
      origin: request.headers.get('origin'),
      contentType: request.headers.get('content-type'),
      bodyText: await request.text(),
    },
    clientEnv.appUrl,
  )
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status, headers: NO_STORE })
  }

  const user = await getVerifiedUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401, headers: NO_STORE })
  }

  const outcome = await runWithdraw(parsed.idToken, {
    userId: user.id,
    verifyReauth: async (token, maxAuthAgeSec) => {
      const verified = await verifyFirebaseIdToken(token, maxAuthAgeSec)
      return verified.ok ? { ok: true, sub: verified.claims.sub } : { ok: false }
    },
    beginWithdrawal: (token) => beginWithdrawal(token),
    firebaseDelete: deleteFirebaseAccount,
    finishWithdrawal: (token) => finishWithdrawal(token),
    log: (event, detail) => {
      console.error(detail ? `${event} sub=${detail.sub}` : event)
    },
  })

  switch (outcome) {
    case 'done': {
      const response = NextResponse.json({ ok: true }, { headers: NO_STORE })
      response.cookies.set(SESSION_COOKIE_NAME, '', clearedCookieAttributes(isSecureCookie()))
      return response
    }
    case 'reauth_rejected':
      return NextResponse.json({ ok: false, error: 'reauth_required' }, { status: 403, headers: NO_STORE })
    case 'begin_failed':
      // 印を書けていない = 何も消えていない。cookie を残し、やり直せる
      return NextResponse.json({ ok: false, error: 'withdraw_not_started' }, { status: 500, headers: NO_STORE })
  }
}
