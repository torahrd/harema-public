/**
 * 店の保存と出典のタイトルの取得の核(Server Action `savePlace`・`fetchSourceTitle` と、
 * mobile の受け口 `/api/mobile/v1/saved-places`・`/api/mobile/v1/source-title` が同じ手順を通る)。
 *
 * 置き方の約束(`lib/auth/core.ts` と同じ): 値の import を持たない(型は `import type`)。
 * 外向きの通信・DB は deps として受ける。入力の検証と認可(利用者の確かめ)は呼び出し側が先に済ませる —
 * ここに来る `userId` は署名を検証した ID トークンの `sub` だけ。
 */
import type { SavedPlaceStatus } from '@harema/shared/constants'
import type { FetchSourceTitleResult, SavePlaceResult } from '@harema/shared/validations'
import type { ResolvedPlace } from './details'

// 応答の型は shared(mobile と同じ物を読む)。名前はここから export し直す。
export type { FetchSourceTitleResult, SavePlaceResult }


/** `savePlaceInputSchema` を通した後の形(空欄は null)。 */
export type SavePlaceParsed = {
  googlePlaceId: string
  status: SavedPlaceStatus
  memo: string | null
  sourceText: string | null
  sourceTitle: string | null
}

export type SavedRowFields = {
  status: SavedPlaceStatus
  memo: string | null
  source_text: string | null
  source_title: string | null
}

export type SavePlaceDeps = {
  /** 署名を検証した ID トークンの sub。クライアントから受け取らない。 */
  userId: string
  fetchPlaceLocation: (googlePlaceId: string) => Promise<ResolvedPlace | null>
  upsertVerifiedPlace: (place: ResolvedPlace) => Promise<string>
  /** 自分の行の status。行が無ければ `status: null`。DB のエラーは `ok: false`。 */
  findSavedStatus: (
    placeId: string,
  ) => Promise<{ ok: true; status: SavedPlaceStatus | null } | { ok: false }>
  /** user_id は deps の `userId` で入れる。UNIQUE の競合(23505)は `conflict: true`。 */
  insertSaved: (
    placeId: string,
    fields: SavedRowFields,
  ) => Promise<{ ok: true } | { ok: false; conflict: boolean }>
  updateSaved: (placeId: string, fields: SavedRowFields) => Promise<boolean>
  isAllowedStatusChange: (from: SavedPlaceStatus | null, to: SavedPlaceStatus) => boolean
}

/**
 * 保存 / 更新の本体(順序に意味がある)。
 *   1. サーバ側 Place Details で実在検証 + lat/lng 取得。失敗したら places を書かない
 *   2. 検証済み座標を用途限定の admin 関数で places に書く(§11.1-8)
 *   3. 既存行の有無で INSERT / UPDATE を分け、逆戻り遷移を拒否する(§6.2・§8)
 */
export async function runSavePlace(
  parsed: SavePlaceParsed,
  deps: SavePlaceDeps,
): Promise<SavePlaceResult> {
  const resolved = await deps.fetchPlaceLocation(parsed.googlePlaceId)
  if (!resolved) return { ok: false, reason: 'place_not_found' }

  let placeId: string
  try {
    placeId = await deps.upsertVerifiedPlace(resolved)
  } catch {
    return { ok: false, reason: 'failed' }
  }

  const existing = await deps.findSavedStatus(placeId)
  if (!existing.ok) return { ok: false, reason: 'failed' }

  const fields: SavedRowFields = {
    status: parsed.status,
    memo: parsed.memo,
    source_text: parsed.sourceText,
    source_title: parsed.sourceTitle,
  }

  if (existing.status === null) {
    const inserted = await deps.insertSaved(placeId, fields)
    if (!inserted.ok) {
      // UNIQUE(user_id, place_id) の競合(= 別の端末等で先に保存された)。行は作られていないので成功に畳まない
      return { ok: false, reason: inserted.conflict ? 'conflict' : 'failed' }
    }
    return { ok: true, mode: 'created' }
  }

  // 評価済み(want_to_go 以外)から「行きたい」へは戻せない
  if (!deps.isAllowedStatusChange(existing.status, parsed.status)) {
    return { ok: false, reason: 'status_reverted' }
  }
  const updated = await deps.updateSaved(placeId, fields)
  if (!updated) return { ok: false, reason: 'failed' }
  return { ok: true, mode: 'updated' }
}

export type FetchSourceTitleDeps = {
  claim: (
    url: string,
  ) => Promise<{ allowed: true; key: string } | { allowed: false; cachedTitle: string }>
  fetchTitle: (url: string) => Promise<string | null>
  complete: (key: string, title: string | null) => Promise<boolean>
}

/**
 * 出典 URL の og:title を取りに行く本体。認証と URL の検証は呼び出し側が先に済ませる。
 * サーバ側の抑制(DB の台帳)を通った後にだけ外へ出る。抑制で止まったときは、取得済みのタイトルがあればそれを返す。
 * 取得の失敗も complete を 1 回呼び、同じ URL への再挑戦を窓の間だけ外へ出さない。
 */
export async function runFetchSourceTitle(
  url: string,
  deps: FetchSourceTitleDeps,
): Promise<FetchSourceTitleResult> {
  const claim = await deps.claim(url)
  if (!claim.allowed) {
    return claim.cachedTitle.length > 0
      ? { ok: true, title: claim.cachedTitle }
      : { ok: false, reason: 'unavailable' }
  }
  const title = await deps.fetchTitle(url)
  const recorded = await deps.complete(claim.key, title)
  if (!recorded || !title) return { ok: false, reason: 'unavailable' }
  return { ok: true, title }
}
