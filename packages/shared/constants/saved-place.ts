import { Constants } from '@harema/supabase/types'
import type { Database } from '@harema/supabase/types'

/**
 * 保存状態の 3 値。DB enum(saved_place_status)の生成 Constants から導出し、
 * 状態値の文字列リテラルを再宣言しない(生成物と実体をズラさない)。
 */
export const SAVED_PLACE_STATUSES = Constants.public.Enums.saved_place_status

export type SavedPlaceStatus = Database['public']['Enums']['saved_place_status']
