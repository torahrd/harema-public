import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/auth/proxy-session'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * 静的アセット以外のすべてのリクエストでセッション(ID トークン)を更新する。除外するもの:
     * - _next/static(静的ファイル)
     * - _next/image(画像最適化)
     * - favicon.ico
     * - auth/session(ログインの受付。自前で cookie を張るため proxy の更新と競合させない)
     * - api/mobile/(mobile の受け口。Bearer だけで認証し、cookie を読まない・書かない。spec §11.1-10)
     * - 画像ファイルの拡張子
     */
    '/((?!_next/static|_next/image|favicon.ico|auth/session|api/mobile/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
