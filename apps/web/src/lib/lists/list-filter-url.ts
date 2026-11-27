import { listIdSchema } from '@harema/shared/validations'

// リストの絞りを URL の query(`list`)に出し入れする純粋な関数(react・DB は import しない。node のテストが直接読む)。
// 出どころ: 単位 lists-filter-carry の PLAN 1。値は client で `listIdSchema`(uuid)を通し、
// さらに画面が `resolveSelectedList` で自分のリストの id だけに絞ってから使う。

/** 絞りのリストの id を入れる query の名前。「すべて」の時は付けない。 */
export const LIST_PARAM = 'list'

/** URL から読んだ値を、リストの id(uuid)の形の時だけ返す。それ以外(無い・不正)は null(= 「すべて」)。 */
export function parseListParam(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const parsed = listIdSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/**
 * query の文字列の `list` だけを足す・消す(ほかの値と順は保つ)。空なら `''`、あれば先頭に `?` を付けて返す。
 * `listId` が null なら `list` を消す。
 */
export function searchWithList(search: string, listId: string | null): string {
  const params = new URLSearchParams(search)
  if (listId === null) params.delete(LIST_PARAM)
  else params.set(LIST_PARAM, listId)
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}

/** 行き先の path に、絞りを付ける(「すべて」なら付けない)。 */
export function pathWithList(path: '/map' | '/saved' | '/lists', listId: string | null): string {
  return `${path}${searchWithList('', listId)}`
}
