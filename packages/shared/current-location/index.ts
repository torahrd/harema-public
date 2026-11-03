/**
 * 現在地の点(spec §7)の形・動き・純粋な計算。web と mobile が同じ物を読む。
 * 座標はこの中だけで使い、どこへも送らない。
 * 1 ファイル・相対 import なし・型の注記だけ(mobile のテストが型除去で直接読むため)。
 */

/** 形の値(CSS px / RN の dp)。`markerBox` は web の箱の一辺。 */
export const CURRENT_LOCATION_SHAPE = {
  dotDiameter: 20,
  dotRing: 3,
  accuracyDiameter: 56,
  markerBox: 88,
} as const

/** 位置が変わったときに点が移る時間(ミリ秒)。 */
export const CURRENT_LOCATION_MOVE_MS = 1000

export type LatLng = { latitude: number; longitude: number }

export type Move = { from: LatLng; to: LatLng; startMs: number }

function clamp01(t: number): number {
  if (Number.isNaN(t)) return 0
  return Math.min(1, Math.max(0, t))
}

/** ease-out cubic。t は [0, 1] に収めてから使う。 */
export function easeOutCubic(t: number): number {
  const c = clamp01(t)
  return 1 - (1 - c) ** 3
}

/** 経過時間から進み [0, 1] を出す。動きを減らす設定なら常に 1(即時)。負・NaN は 0。 */
export function moveProgress(elapsedMs: number, reduceMotion: boolean): number {
  if (reduceMotion) return 1
  return clamp01(elapsedMs / CURRENT_LOCATION_MOVE_MS)
}

/** 進みに ease-out cubic を掛けて、緯度・経度を線形に混ぜる(日本の中だけなので日付変更線は扱わない)。 */
export function interpolateLatLng(from: LatLng, to: LatLng, progress: number): LatLng {
  const e = easeOutCubic(progress)
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * e,
    longitude: from.longitude + (to.longitude - from.longitude) * e,
  }
}

/** 最初(displayed が null)は動かさず置く。途中なら、そのときの表示の位置から動き直す。 */
export function retarget(displayed: LatLng | null, next: LatLng): { from: LatLng; to: LatLng } {
  return { from: displayed ?? next, to: next }
}

export function startMove(displayed: LatLng | null, next: LatLng, nowMs: number): Move {
  const { from, to } = retarget(displayed, next)
  return { from, to, startMs: nowMs }
}

export function sampleMove(
  move: Move,
  nowMs: number,
  reduceMotion: boolean,
): { position: LatLng; done: boolean } {
  const progress = moveProgress(nowMs - move.startMs, reduceMotion)
  return {
    position: interpolateLatLng(move.from, move.to, progress),
    done: progress >= 1,
  }
}

/** 緯度と経度の値が両方等しいときだけ true(a が null なら false)。 */
export function sameLatLng(a: LatLng | null, b: LatLng): boolean {
  return a !== null && a.latitude === b.latitude && a.longitude === b.longitude
}

// ---- 向きの光(spec §7)。方位の許可(DeviceOrientation)は使わず、続けて取れた位置の差から向きを出す ----

/** 光の形。`radius` は `CURRENT_LOCATION_SHAPE.markerBox` の半分。`stops` は `[位置, 不透明度]`。 */
export const CURRENT_LOCATION_BEAM = {
  radius: 44,
  halfAngleDeg: 34,
  stops: [
    [0, 0.9],
    [0.25, 0.62],
    [0.5, 0.37],
    [0.75, 0.15],
    [1, 0],
  ],
} as const

/** 向きを更新するのに、基点から動く最小の距離(m)。位置の誤差の半径がこれより大きいときはその半径。 */
export const HEADING_MIN_DISTANCE_M = 20

const EARTH_RADIUS_M = 6371008.8
const toRad = (deg: number): number => (deg * Math.PI) / 180

/** 2 点の距離(m)。haversine。 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 大円の初めの方位。北 0・時計回り・[0, 360)。 */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const phi1 = toRad(from.latitude)
  const phi2 = toRad(to.latitude)
  const dLng = toRad(to.longitude - from.longitude)
  const y = Math.sin(dLng) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng)
  const deg = (Math.atan2(y, x) * 180) / Math.PI
  return ((deg % 360) + 360) % 360
}

export type HeadingState = { anchor: LatLng; heading: number | null }

/**
 * 新しい位置から向きの状態を進める。初回は向きを持たない(光を出さない)。
 * 基点から `max(20m, 位置の誤差の半径)` 以上動いたときだけ向きと基点を更新する。
 * 届かない間(止まっている間・小さな揺れ)は state をそのまま返す。
 */
export function nextHeading(
  state: HeadingState | null,
  fix: LatLng,
  accuracyM: number | null,
): HeadingState {
  if (state === null) return { anchor: fix, heading: null }
  const valid = accuracyM !== null && Number.isFinite(accuracyM) && accuracyM > 0
  const need = Math.max(HEADING_MIN_DISTANCE_M, valid ? accuracyM : 0)
  if (distanceMeters(state.anchor, fix) >= need) {
    return { anchor: fix, heading: bearingDegrees(state.anchor, fix) }
  }
  return state
}

/** 画面の上を 0 とした光の角度。地図が回されているときは、その向きを引く。[0, 360)。 */
export function screenBeamAngle(heading: number, mapHeading: number | null | undefined): number {
  const deg = heading - (mapHeading ?? 0)
  return ((deg % 360) + 360) % 360
}

/** 中心 `(radius, radius)`・北向き(上)を 0 として ±halfAngleDeg の扇の SVG の `d`。 */
export function beamWedgePath(radius: number, halfAngleDeg: number): string {
  const a = toRad(halfAngleDeg)
  const x1 = radius - radius * Math.sin(a)
  const x2 = radius + radius * Math.sin(a)
  const y = radius - radius * Math.cos(a)
  const f = (n: number): string => String(Math.round(n * 100) / 100)
  return `M ${f(radius)} ${f(radius)} L ${f(x1)} ${f(y)} A ${f(radius)} ${f(radius)} 0 0 1 ${f(x2)} ${f(y)} Z`
}
