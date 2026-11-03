import type { SavedPlaceStatus } from '../constants'

/**
 * 日本語リソース(MVP は ja のみ)。next-intl の配線は UI ゲート(spec §10)後の WP で行う。
 * ここでは辞書と型構造だけを置く。文言は spec §7 の逐語のみで、新しい文言を発明しない。
 */
export const ja = {
  savedPlaceStatus: {
    want_to_go: '行きたい',
    visit_again: 'また行きたい',
    no_thanks: 'もういい',
  },
} satisfies { savedPlaceStatus: Record<SavedPlaceStatus, string> }
