import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@harema/supabase/types'
import { readListIcon } from '@harema/shared/validations'
import type { ListChoice } from './list-selection'

/**
 * 自分のリストの全行(作った順)。**失敗は投げる**(0 件の正常画面に化けさせない。error boundary に拾わせる)。
 * `user_id` の条件は書かない(own-only の RLS が境界。3 つの page の先例)。アイコンは読みの入口(`readListIcon`)を通す。
 * client へ渡すのは `id`・`name`・`icon`・`created_at` だけ(`user_id` を渡さない)。
 */
export async function readLists(supabase: SupabaseClient<Database>): Promise<ListChoice[]> {
  const { data, error } = await supabase
    .from('lists')
    .select('id, name, icon, created_at')
    .order('created_at')
    .order('id')
  if (error) {
    throw error
  }
  return data.map((row) => ({ ...row, icon: readListIcon(row.icon) }))
}

/**
 * 自分のリストの全行と、保存した店ごとの所属(`saved_places.id` → 入っているリストの id の並び)。
 * リストの側から `list_places` を埋め込んで 1 回で読む(一覧の画面の `saved_places` の select は座標の列だけを足す決まり
 * `list-map-layout.test.mjs` を保つため、所属は `saved_places` に埋め込まない)。失敗は投げる。
 */
export async function readListsWithMembers(
  supabase: SupabaseClient<Database>,
): Promise<{ lists: ListChoice[]; membership: ReadonlyMap<string, string[]> }> {
  const { data, error } = await supabase
    .from('lists')
    .select('id, name, icon, created_at, list_places(saved_place_id)')
    .order('created_at')
    .order('id')
  if (error) {
    throw error
  }
  const membership = new Map<string, string[]>()
  const lists = data.map((row) => {
    for (const member of row.list_places) {
      const ids = membership.get(member.saved_place_id)
      if (ids) ids.push(row.id)
      else membership.set(member.saved_place_id, [row.id])
    }
    return { id: row.id, name: row.name, icon: readListIcon(row.icon), created_at: row.created_at }
  })
  return { lists, membership }
}
