import { SOURCE_TEXT_MAX_LENGTH, type SavedPlaceStatus } from '@harema/shared/constants'
import type { ResolveSavedPlaceResult } from './save-actions'

// 保存シートの入力欄の初期値と、共有の出典を検索 → シートへ渡す遷移(apps/mobile/src/map/sheet-outcome.ts の写し)。
// 純粋な関数だけ(node のテストが読む)。

export type InitialFields = {
  existingStatus: SavedPlaceStatus | null
  status: SavedPlaceStatus
  memo: string
  sourceText: string
  sourceTitle: string
  /** この値で出典のタイトルを 1 回取りに行く(取りに行かないなら null)。 */
  fetchTitleFor: string | null
}

/**
 * - 編集(保存済みの店): DB の値を入れる。共有の出典で DB の出典を上書きしない。
 * - 新規: 出典があれば 1000 コードポイントで止めて入れ、前後の空白を除いて空でなければタイトルを 1 回取りに行く。
 */
export function initialSheetFields(
  result: Extract<ResolveSavedPlaceResult, { ok: true }>,
  initialSourceText: string | null | undefined,
  defaultStatus: SavedPlaceStatus,
): InitialFields {
  if (result.mode === 'edit') {
    return {
      existingStatus: result.status,
      status: result.status,
      memo: result.memo,
      sourceText: result.sourceText,
      sourceTitle: result.sourceTitle,
      // 保存済みのタイトルは、保存済みの出典のためのもの。取り直さない。
      fetchTitleFor: null,
    }
  }
  const text = [...(initialSourceText ?? '')].slice(0, SOURCE_TEXT_MAX_LENGTH).join('')
  const trimmed = text.trim()
  return {
    existingStatus: null,
    status: defaultStatus,
    memo: '',
    sourceText: text,
    sourceTitle: '',
    fetchTitleFor: trimmed.length > 0 ? trimmed : null,
  }
}

/** launchSource = 検索を開いたときの共有の出典。sheetSource = いまのシートへ渡す出典(検索とは別に持つ)。 */
export type SourceState = { launchSource: string | null; sheetSource: string | null }

export const EMPTY_SOURCE_STATE: SourceState = { launchSource: null, sheetSource: null }

/** 共有で検索を開いた。 */
export function sourceOnLaunch(state: SourceState, sourceText: string | null): SourceState {
  return { ...state, launchSource: sourceText }
}

/** 候補・POI・ピンでシートを開く。launchSource をシートへ移す(closeSearch が launchSource を消す前に)。 */
export function sourceOnOpenSheet(state: SourceState): SourceState {
  return { launchSource: null, sheetSource: state.launchSource }
}

/** 選ばずに検索を閉じる。シートへ移した値はそのまま。 */
export function sourceOnCloseSearch(state: SourceState): SourceState {
  return { ...state, launchSource: null }
}

/** シートを閉じる・保存の後。前の出典が別の店へ入らない。 */
export function sourceOnCloseSheet(state: SourceState): SourceState {
  return { ...state, sheetSource: null }
}
