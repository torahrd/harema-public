import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  OAuthProvider,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  revokeAccessToken,
  signInWithPopup,
  signOut,
  type Auth,
  type AuthProvider,
} from 'firebase/auth'
import { clientEnv } from '@/env/client'
import type { SsoCredential, SsoProvider } from '@/lib/auth/browser-flow'

/**
 * ブラウザ側の Firebase の JS SDK の口(login-replace・形 C)。ブラウザからだけ使う('use client' の部品が import する)。
 *
 * - 状態はメモリにだけ置く(`inMemoryPersistence`)。localStorage・IndexedDB・sessionStorage に更新用の鍵を残さない
 *   (LR-B3)。サーバが自前の暗号化した cookie を持つので、ブラウザの SDK は入った直後に ID トークンと更新用の鍵を
 *   渡して役目を終える(`lib/auth/browser-flow.ts` が直後に `signOut` する)。
 * - スコープを足さない(Apple の name・email を要求しない・個人情報をなるべく持たない = charter.md:3)。
 * - local の検査だけ、`NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`(発行の口)へ向ける。loopback の http 以外は拒む。
 * - `signInWithPopup` は利用者のクリックの直後に呼ぶ(popup の遮断を避ける)ので、この口の関数は await を挟まずに
 *   SDK を呼ぶ。module scope で作るのは SDK の入れ物(Auth)の使い回しだけで、Supabase の client ではない。
 */

let cachedAuth: Auth | null = null

function isLoopbackHttp(url: URL): boolean {
  return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
}

function browserAuth(): Auth {
  if (cachedAuth !== null) return cachedAuth
  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey: clientEnv.firebaseApiKey,
          authDomain: clientEnv.firebaseAuthDomain,
          projectId: clientEnv.firebaseProjectId,
        })
  let auth: Auth
  try {
    auth = initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    })
  } catch (error) {
    // 同じ app で初期化し直した(開発中の再読み込み)ときだけ、作ってある入れ物(メモリだけ)を使う。
    // ほかの失敗で getAuth に落とさない(getAuth は既定の保存先 = 端末に残る形で作り直してしまう)。
    if ((error as { code?: unknown }).code !== 'auth/already-initialized') throw error
    auth = getAuth(app)
  }
  const emulatorHost = clientEnv.firebaseAuthEmulatorHost
  if (emulatorHost !== undefined) {
    const url = new URL(emulatorHost)
    if (!isLoopbackHttp(url)) throw new Error('NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST must be a loopback http URL')
    connectAuthEmulator(auth, url.origin, { disableWarnings: true })
  }
  cachedAuth = auth
  return auth
}

function providerFor(provider: SsoProvider): AuthProvider {
  return provider === 'apple' ? new OAuthProvider('apple.com') : new GoogleAuthProvider()
}

/**
 * popup のボタンを出す画面が開いたときに呼ぶ(ログインの画面・退会のダイアログ)。SDK の入れ物を先に作る。
 * Safari・iOS・モバイルでは、作った時点で SDK が popup の受け口(iframe)を先に読み込む(`_shouldInitProactively`)。
 * これをクリックの中で初めて行うと、iframe の読み込みを待つ間に「利用者の操作の直後」の扱いが切れ、Safari が
 * 1 回目の popup を止める(2026-11-02 に R1′ の F-7 で実測)。失敗はここでは握り、クリックの側で同じ失敗として扱う。
 */
export function prepareSso(): void {
  try {
    browserAuth()
  } catch {
    // クリックの時に signInWithSso が同じ失敗を投げ、画面の失敗の表示になる
  }
}

/**
 * popup で入る。ID トークン(入った直後 = auth_time が新しい)・更新用の鍵・事業者の access token(Apple の取り消し用)を
 * 返す。popup を閉じる・遮断されるなどの失敗は throw(分類は `isPopupCancellation`)。
 */
export async function signInWithSso(provider: SsoProvider): Promise<SsoCredential> {
  const result = await signInWithPopup(browserAuth(), providerFor(provider))
  const accessToken = OAuthProvider.credentialFromResult(result)?.accessToken ?? null
  const idToken = await result.user.getIdToken()
  return { idToken, refreshToken: result.user.refreshToken, accessToken }
}

/** Apple の access token を取り消す(退会の前・本人の確認の直後。Apple の定め)。 */
export async function revokeAppleAccessToken(accessToken: string): Promise<void> {
  await revokeAccessToken(browserAuth(), accessToken)
}

/** SDK のメモリ上の状態を消す。 */
export async function signOutBrowser(): Promise<void> {
  if (cachedAuth === null) return
  await signOut(cachedAuth)
}
