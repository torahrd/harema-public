import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

// `v` フラグだけ無い環境(Intl.Segmenter はある・Safari 16 などの形)にしてから読み込む。
const OrigRegExp = globalThis.RegExp
globalThis.RegExp = new Proxy(OrigRegExp, {
  construct(target, args) {
    if (args[1] === 'v') throw new SyntaxError('no v flag')
    return new target(...args)
  },
})
const { isListIcon, readListIcon } = await import(
  '../../../../../packages/shared/validations/list-icon.ts'
)

describe('T-C3b v フラグだけ無い環境', () => {
  it('書記素 1 つの絵文字(ZWJ・旗・肌色)・漢字・英数・結合形を通す', () => {
    for (const v of ['🍜', '👨\u200d👩\u200d👧', '🇯🇵', '👍🏽', '✈\ufe0f', '麺', 'A', '1', 'か\u3099', '葛\u{e0100}', '\u{1f3f4}\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}']) {
      assert.equal(isListIcon(v), true, JSON.stringify(v))
    }
  })
  it('2 つ・空白・見えない文字・先頭の結合記号・空・長すぎる値は拒む', () => {
    for (const v of ['', 'ab', '麺麺', '🍜🍜', ' ', '\u200b', '\u202e', '\u0301', '\ue000', '\u200d', '\u3164', '\u2800', '\u200d\ufe0f', '\u200d\u0301', '🍜'.repeat(33)]) {
      assert.equal(isListIcon(v), false, JSON.stringify(v))
      assert.equal(readListIcon(v), null, JSON.stringify(v))
    }
  })
})
