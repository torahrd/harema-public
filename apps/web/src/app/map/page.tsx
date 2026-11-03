import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { SAVED_PLACE_STATUSES, type SavedPlaceStatus } from '@harema/shared/constants'
import { refreshStalePlaces } from '@/lib/places/refresh-stale'
import { createUserSupabase, getVerifiedUser } from '@/lib/auth/session'
import type { AccountSnapshot } from '../account/drawer'
import { MapScreen } from './map-screen'
import type { SavedPlaceMarker } from './types'

// もういい(no_thanks)は地図に出さない(spec §7)。表示する状態は生成 enum から導出し、
// 状態値のリテラルを再宣言しない。
const HIDDEN_ON_MAP_STATUS: SavedPlaceStatus = 'no_thanks'
const MAP_VISIBLE_STATUSES = SAVED_PLACE_STATUSES.filter(
  (status) => status !== HIDDEN_ON_MAP_STATUS,
)

/**
 * 地図画面のガード(Server Component)。onboarding/page.tsx の鏡像:getVerifiedUser()(spec §11.1-4)で
 * 認証を確認し(未認証 → /login)、profiles 未作成 → /onboarding。認証済み・登録済みのユーザーの
 * 保存ピン(行きたい / また行きたい)を取得して client の <MapScreen> へ渡す。
 *
 * アカウント管理(WP-11・右ドロワー)の現在値(username)も
 * ここで取り、props で drawer へ渡す(計画 §(c) 単位 1「仕様の既定」・R0-25)。browser 用の
 * Supabase client は使わず、更新後の再取得は Server Action の revalidatePath('/map') と
 * クライアントの router.refresh() で行う。
 *
 * places / saved_places への書込は一切しない。Supabase クライアントは
 * リクエストハンドラ内で生成し(module scope 禁止・spec §11.1-5)、認可は getVerifiedUser() のみ。
 */
export default async function MapPage() {
  const user = await getVerifiedUser()
  if (!user) {
    redirect('/login')
  }
  const supabase = await createUserSupabase()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    redirect('/onboarding')
  }

  // メールの表示と変更(D2・D3)は撤去した(ログインの識別子が Apple / Google のアカウントになり、hareMa は
  // メールを持たない・login-replace PLAN §0.3)。
  // provider は退会の本人の確認の出し分け用(署名を検証した ID トークンの値・認可には使わない)。
  const account: AccountSnapshot = { username: profile.username, provider: user.provider }

  const { data: rows, error } = await supabase
    .from('saved_places')
    .select(
      'id, status, places(google_place_id, latitude, longitude, cached_at)',
    )
    .in('status', MAP_VISIBLE_STATUSES)
  // 取得失敗を「保存 0 件の正常画面」に化けさせない。error boundary に拾わせる。
  if (error) {
    throw error
  }

  // 29 日を超えた(座標が消えた)行の取り直しは、応答を送出した後に走らせる(spec §4.3)。
  // その行はピンにせず、更新結果は次回の表示に出る。cookies() は getVerifiedUser() と createUserSupabase() が上で読み終えて
  // いるので、コールバックの中で request API を触ることはない(Next.js の `after` の制約)。
  after(() =>
    refreshStalePlaces(
      supabase,
      (rows ?? []).flatMap((row) => (row.places ? [row.places] : [])),
    ),
  )

  const savedPlaces: SavedPlaceMarker[] = (rows ?? []).flatMap((row) => {
    const place = row.places
    // no_thanks はクエリで除外済み。ここで narrowing して型の不変(地図に来ない)を満たす。
    if (!place || row.status === 'no_thanks') return []
    // 29 日を超えて DB が座標を消した行(店は残る)はピンにしない。表示時の取り直しが戻す。
    if (place.latitude === null || place.longitude === null) return []
    return [
      {
        id: row.id,
        status: row.status,
        latitude: place.latitude,
        longitude: place.longitude,
      },
    ]
  })

  return <MapScreen savedPlaces={savedPlaces} account={account} />
}
