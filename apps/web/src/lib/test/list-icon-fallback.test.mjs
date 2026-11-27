import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

// `v` フラグと Intl.Segmenter の無い環境(古いブラウザ)にしてから読み込む。
// node --test はファイルごとに別のプロセスなので、ほかの検査に漏れない。
const OrigRegExp = globalThis.RegExp
globalThis.RegExp = new Proxy(OrigRegExp, {
  construct(target, args) {
    if (args[1] === 'v') throw new SyntaxError('no v flag')
    return new target(...args)
  },
})
delete Intl.Segmenter
const { isListIcon, readListIcon } = await import(
  '../../../../../packages/shared/validations/list-icon.ts'
)

describe('T-C3b v フラグも Intl.Segmenter も無い環境', () => {
  it('module の読み込みと判定が投げず、絵文字を通す', () => {
    assert.equal(isListIcon('🍜'), true)
    assert.equal(readListIcon('🍜'), '🍜')
  })
  it('空・空白・見えない文字・双方向の制御・先頭の結合記号・長すぎる値は拒み、1 文字・ZWJ・異体字セレクタは通す', () => {
    for (const v of ['', ' ', '\u3000', '\u200b', '\u202e', 'a\u202e', '\u0301', '\ue000', 'a'.repeat(33), '\u200d', '\u200d\u200d', '\u3164', '\u2800', '\u200d\ufe0f', '\u200d\u0301']) {
      assert.equal(isListIcon(v), false, JSON.stringify(v))
      assert.equal(readListIcon(v), null, JSON.stringify(v))
    }
    for (const v of ['麺', 'A', '1', 'か\u3099', '葛\u{e0100}', '👨\u200d👩\u200d👧', '✈\ufe0f', '🍜🍜', '\u{1f3f4}\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}']) {
      assert.equal(isListIcon(v), true, JSON.stringify(v))
    }
  })
})
