import { redirect } from 'next/navigation'
import { after } from 'next/server'
import {
  SAVED_PLACE_STATUSES,
  type SavedPlaceStatus,
} from '@harema/shared/constants'
import { savedPlaceStatusSchema } from '@harema/shared/validations'
import { refreshStalePlaces } from '@/lib/places/refresh-stale'
import { createUserSupabase, getVerifiedUser } from '@/lib/auth/session'
import { toListPosition } from './list-map-layout'
import { SavedListScreen } from './saved-list-screen'
import type { SavedListCounts, SavedListRow } from './types'

/**
 * 既定タブは 1 つ目の状態(spec §6.3)。状態値のリテラルを再宣言しないので、生成 enum
 * (DB の saved_place_status)の先頭から取る —— design D-3 のタブの並びと同じ順序。
 */
const DEFAULT_STATUS: SavedPlaceStatus = SAVED_PLACE_STATUSES[0]

type SavedPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** 3 状態の件数を 1 度の走査で数える。追加クエリを撃たない(spec §4.2 に「件数」の行は無い)。 */
function countByStatus(rows: readonly { status: SavedPlaceStatus }[]): SavedListCounts {
  const tally = new Map<SavedPlaceStatus, number>()
  for (const row of rows) {
    tally.set(row.status, (tally.get(row.status) ?? 0) + 1)
  }
  const [first, second, third] = SAVED_PLACE_STATUSES
  return {
    [first]: tally.get(first) ?? 0,
    [second]: tally.get(second) ?? 0,
    [third]: tally.get(third) ?? 0,
  }
}

/**
 * 保存した店の一覧(⑤・Server Component)。map/page.tsx の鏡像でガードし(getVerifiedUser() で認証・
 * spec §11.1-4 / profiles 未作成 → /onboarding)、保存行を 1 クエリで取って client へ渡す。
 *
 * 本 WP は読み取りのみ。表示用の店名・住所は**サーバでは取らない** —— クライアント側で、
 * 画面に見えた行だけメモリキャッシュ経由で取る(spec §4.3・ユーザー裁定 2026-08-12)。
 * 座標は一覧の地図のピンのために select する(/map と同じ列の名前。自分の行だけ client へ渡す)。
 * 地図画面は もういい を select しないので、もういいの座標の 30 日の取り直し(spec §4.3)は
 * ここで、もういいの行だけを応答の後に走らせる(行きたい・また行きたいは /map の担当)。
 */
export default async function SavedPage({ searchParams }: SavedPageProps) {
  const user = await getVerifiedUser()
  if (!user) {
    redirect('/login')
  }
  const supabase = await createUserSupabase()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    redirect('/onboarding')
  }

  // 不正値・欠落は既定タブに落とす(エラー画面にしない)。検証は共有スキーマで行う。
  const params = await searchParams
  const requestedStatus = savedPlaceStatusSchema.safeParse(params.status)
  const initialStatus = requestedStatus.success ? requestedStatus.data : DEFAULT_STATUS

  // 3 タブ分を 1 度に取る(タブ切替でサーバへ戻らない)。user_id の明示フィルタは書かない ——
  // own-only RLS が境界を担保する(map/page.tsx と同じ前例)。
  const { data: rows, error } = await supabase
    .from('saved_places')
    .select('id, status, created_at, places(google_place_id, latitude, longitude, cached_at)')
    .order('created_at', { ascending: false })
  // 取得失敗を「保存 0 件の正常画面」に化けさせない。error boundary に拾わせる。
  if (error) {
    throw error
  }

  // 29 日を超えた(座標が消えた)もういいの行を取り直す(Google の規約の 30 日・place-refresh #39)。応答を送出した後に走らせる。
  // cookies() は上で読み終えている(Next.js の `after` の制約)。
  after(() =>
    refreshStalePlaces(
      supabase,
      (rows ?? []).flatMap((row) =>
        row.status === 'no_thanks' && row.places ? [row.places] : [],
      ),
    ),
  )

  const savedRows: SavedListRow[] = (rows ?? []).flatMap((row) => {
    const place = row.places
    if (!place) return []
    return [
      {
        id: row.id,
        status: row.status,
        googlePlaceId: place.google_place_id,
        position: toListPosition(row.status, place.latitude, place.longitude),
      },
    ]
  })

  return (
    <SavedListScreen
      rows={savedRows}
      // 件数は DB の行そのものから数える(join の防御で落ちた行があっても真値を出す)。
      counts={countByStatus(rows ?? [])}
      initialStatus={initialStatus}
    />
  )
}
