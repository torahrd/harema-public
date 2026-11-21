// web の地図の SDK の言語は表示言語に従う(ソースの形を見る)。実行: `pnpm --filter web test`
// `language="ja"` の直書きが 0・`language` は useLocale() の値・`region="JP"` は 3 画面とも残す
// (region は言語でなく国の書式と順位の指定。製品は日本の店を探す)。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const SCREENS = {
  '地図': '../../app/map/map-screen.tsx',
  '一覧': '../../app/saved/saved-list-screen.tsx',
  '詳細': '../../app/places/[id]/place-detail-screen.tsx',
}

describe('T6b 地図の表示の言語', () => {
  for (const [name, path] of Object.entries(SCREENS)) {
    it(`${name}: APIProvider の language は表示言語の変数で、"ja" の直書きが無い。region は JP`, () => {
      const src = read(path)
      const providers = src.match(/<APIProvider\s[^>]*>/g) ?? []
      assert.equal(providers.length, 1, 'APIProvider が 1 つ')
      const tag = providers[0]
      assert.doesNotMatch(src, /language="(ja|en)"/)
      const m = /\blanguage=\{(\w+)\}/.exec(tag)
      assert.ok(m, 'language が変数で渡っている')
      assert.match(src, new RegExp(`const ${m[1]} = useLocale\\(\\)`), 'その変数は useLocale() の値')
      assert.match(tag, /\bregion="JP"/)
    })
  }
})
