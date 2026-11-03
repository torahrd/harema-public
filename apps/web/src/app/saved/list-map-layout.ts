// 一覧(saved)の上の地図と、下の一覧の領域の寸法・ピン・範囲を決める純関数。
// import なし(node の type stripping でそのままテストから読む)。

/**
 * 行の 2 スロットの高さ(design「hareMa 一覧 読み込み中」option 1c)。行高 70px は
 * `padding 11 + 24 + margin 3 + 20 + padding 11 + border 1` の内訳で、取得中・解決・失敗の
 * どの状態でも一致する(潰れると 1 画面に入る行数が増え、その分だけ課金される)。
 * 行内の文字はこのスロット高を line-height に取る —— 本文の 1.75 では 70px に収まらない。
 */
export const ROW_PADDING_Y = 11
export const NAME_SLOT_HEIGHT = 24
export const ADDRESS_GAP = 3
export const ADDRESS_SLOT_HEIGHT = 20
export const ROW_BORDER = 1
export const LIST_ROW_HEIGHT = 70

/** 一覧の領域に入れる行数(所有者 2026-11-02 の問 1 = B)。地図は残りの高さを取る。 */
export const LIST_VISIBLE_ROWS = 4

/**
 * 一覧の領域の高さ = 行数 × 70 − 10。−10 は、最後の行が 60px 見えて次の行の上端が領域の外に
 * 10px 離れるため(端が接して交差に数えられるのを避ける)。
 */
export function listRegionHeight(rows: number): number {
  return rows * LIST_ROW_HEIGHT - 10
}

export type ListPosition = { lat: number; lng: number }

/**
 * 行の座標を client へ渡す形にする。3 状態とも渡す(もういいは一覧の地図に灰色のピンで出す・
 * 所有者 2026-11-02 の問 3 = B。自分の行だけ・RLS)。
 * 座標は cached_at から 29 日を超えると DB の毎時の処理が null にする(place-refresh #39)。
 * どちらかが null なら null を返し、ピンにしない。
 */
export function toListPosition(
  _status: string,
  latitude: number | null,
  longitude: number | null,
): ListPosition | null {
  if (latitude === null || longitude === null) return null
  return { lat: latitude, lng: longitude }
}

export type ListMarkerRow<S extends string = string> = {
  id: string
  status: S
  position: ListPosition | null
}

export type ListMarker<S extends string = string> = {
  id: string
  status: S
  position: ListPosition
  /** そのタブの並び(保存日の新しい順)の 1 始まりの番号。行の左の札・ピンの中の数字。 */
  number: number
}

/** そのタブの行のうち、座標を持つ行だけをピンにする。 */
export function markersForTab<S extends string>(
  rows: readonly ListMarkerRow<S>[],
  status: S,
): ListMarker<S>[] {
  const markers: ListMarker<S>[] = []
  let number = 0
  for (const row of rows) {
    if (row.status !== status) continue
    number += 1
    if (row.position === null) continue
    markers.push({ id: row.id, status: row.status, position: row.position, number })
  }
  return markers
}

export type CameraBounds = { north: number; south: number; east: number; west: number }

export type Camera =
  | { kind: 'center'; center: ListPosition; zoom: number }
  | { kind: 'bounds'; bounds: CameraBounds }

/** 2 件以上で近すぎるときの zoom の上限(街区が見える上限)。 */
export const MAX_FIT_ZOOM = 17

/**
 * 地図の範囲。0 件 = 既定エリア / 1 件 = その店を中心に既定の zoom / 2 件以上 = 全ピンを
 * 含む範囲(南北東西の最大・最小)。
 */
export function cameraForMarkers(
  markers: readonly { position: ListPosition }[],
  fallbackCenter: ListPosition,
  fallbackZoom: number,
): Camera {
  const [first, ...rest] = markers
  if (first === undefined) {
    return { kind: 'center', center: fallbackCenter, zoom: fallbackZoom }
  }
  if (rest.length === 0) {
    return { kind: 'center', center: first.position, zoom: fallbackZoom }
  }
  let north = first.position.lat
  let south = first.position.lat
  let east = first.position.lng
  let west = first.position.lng
  for (const { position } of rest) {
    north = Math.max(north, position.lat)
    south = Math.min(south, position.lat)
    east = Math.max(east, position.lng)
    west = Math.min(west, position.lng)
  }
  return { kind: 'bounds', bounds: { north, south, east, west } }
}
