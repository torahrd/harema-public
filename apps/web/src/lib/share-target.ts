// Web Share Target の受け口の道と引数の名前(manifest.ts と、受け口のコードと、node のテストが読む)。
// 静的な JSON に別々に書くと、片方だけ直したときに共有が黙って空になるので、ここに 1 か所だけ持つ。
// 相対 import だけ・`server-only` と `@/` を持たない(node のテストが直接読む)。
// 型だけの import(値は読まない。manifest.ts 経由で node のテストが読んでも @harema/shared の解決を要らない)。
import type { SharedItem } from '@harema/shared/share-parse'

export const SHARE_TARGET_ACTION = '/share'

export const SHARE_TARGET_PARAMS = {
  title: 'title',
  text: 'text',
  url: 'url',
} as const

// 受け口に届いた query(title・text・url)を、iOS の共有と同じ形の SharedItem に並べる。
// 並びは url → text → title。空・空白だけは捨て、同じ文は 1 回。
export function itemsFromShareParams(params: URLSearchParams): SharedItem[] {
  const items: SharedItem[] = []
  const seen = new Set<string>()
  const url = params.get(SHARE_TARGET_PARAMS.url)
  if (url !== null && url.trim() !== '') items.push({ kind: 'url', value: url })
  for (const key of [SHARE_TARGET_PARAMS.text, SHARE_TARGET_PARAMS.title]) {
    const value = params.get(key)
    if (value === null || value.trim() === '' || seen.has(value)) continue
    seen.add(value)
    items.push({ kind: 'text', value })
  }
  return items
}
