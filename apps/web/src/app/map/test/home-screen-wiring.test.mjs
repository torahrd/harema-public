// ホーム画面に追加する案内の配線(ソース照合・所有者の決定 2026-11-09)。実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ja } from '@harema/shared/i18n'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const screen = read('../map-screen.tsx')
const hook = read('../use-install-prompt.ts')
const dialog = read('../home-screen-dialog.tsx')
const drawer = read('../../account/drawer.tsx')
const lib = read('../../../lib/install-prompt.ts')

describe('ホーム画面に追加する案内の配線', () => {
  it('HSP-W1 文言は決定のとおり(一字も変えない)', () => {
    // 文言は辞書(ja.web.homeScreen)の日本語が決定のとおり。
    assert.deepEqual(ja.web.homeScreen, {
      title: 'ホーム画面に追加',
      body1: 'ホーム画面に追加すると、ほかのアプリの共有から保存できます。',
      body2: '右のメニューからも、あとで追加できます。',
      never: 'もう表示しない',
      add: '追加する',
    })
    assert.equal(ja.web.drawer.itemAddHome, 'ホーム画面に追加')
    assert.match(dialog, /common\('cancel'\)/)
  })
  it('HSP-W2 モーダルは既存の部品の class を使う(退会のダイアログ・同意の行・縦のボタン)', () => {
    for (const c of ['qs qs-dlg', 'qs qs-scrim', 'qs-dlg-h', 'qs-dlg-b', 'qs-cr', 'qs-dlg-col', 'qs-btn qs-btn-p', 'qs-btn qs-btn-s']) {
      assert.ok(dialog.includes(`"${c}"`), c)
    }
    assert.match(dialog, /<JpText text=\{t\('body1'\)\} \/>/)
    assert.match(dialog, /marginTop: 0 \}\}/)
    assert.match(dialog, /className="qs-cr" style=\{\{ marginTop: 8 \}\}/)
  })
  it('HSP-W3 事件は preventDefault で持ち、Android・standalone を見て、appinstalled で記録する', () => {
    assert.match(hook, /addEventListener\('beforeinstallprompt'/)
    assert.match(hook, /if \(!available\) return\n\s*event\.preventDefault\(\)/)
    assert.match(hook, /\(display-mode: standalone\)/)
    assert.match(hook, /isAndroidDevice\(navigator\.userAgent, uaDataPlatform\(\)\)/)
    assert.match(hook, /addEventListener\('appinstalled'/)
    assert.match(hook, /outcome === 'dismissed'/)
    assert.match(hook, /event\.prompt\(\)/)
    // チェックありでもメニューの項目は出し続ける(canAdd は記録を見ない。モーダルだけ due を掛ける)。
    assert.match(hook, /canAdd: offer !== null,/)
    assert.match(hook, /modalDue: offer !== null && offer\.due && !modalClosed/)
  })
  it('HSP-W4 モーダルは時期の関数を通し、位置情報の idle・検索・保存シート・メニューとそこから開いたダイアログの開きを渡す', () => {
    assert.match(
      screen,
      /installModalTiming\(\{\s*locationPending: locationState === 'idle',\s*searchOpen,\s*sheetOpen: sheetContext !== null,\s*drawerOpen: drawerOpen \|\| accountDialogOpen,\s*\}\)/,
    )
    // ユーザー名変更・退会のダイアログは drawer が持つので、開閉を親へ知らせる(Codex の所見・PR #126)。
    assert.match(screen, /onDialogChange=\{setAccountDialogOpen\}/)
    assert.match(drawer, /onDialogChange\?\.\(dialog !== null\)/)
    assert.match(screen, /\{showHomeDialog && \(\s*<HomeScreenDialog onAdd=\{installPrompt\.add\} onCancel=\{installPrompt\.cancel\} \/>/)
  })
  it('HSP-W5 メニューの項目は「ユーザー名変更」の下で、渡された時だけ。mobile には足さない', () => {
    const i = drawer.indexOf("{t('itemUsername')}")
    const j = drawer.indexOf("{t('itemAddHome')}")
    const k = drawer.indexOf("{t('itemWithdraw')}")
    assert.ok(i > 0 && j > i && k > j)
    assert.match(drawer, /\{onAddToHome && \(/)
    assert.match(screen, /onAddToHome=\{installPrompt\.canAdd \? \(\) => installPrompt\.add\(false\) : undefined\}/)
    assert.equal(readFileSync(new URL('../../../../../mobile/src/account/drawer-items.ts', import.meta.url), 'utf8').includes('ホーム画面'), false)
  })
  it('HSP-W6 記録は localStorage だけ。サーバ・DB・cookie は使わない', () => {
    assert.match(lib, /window\.localStorage/)
    for (const src of [lib, hook, dialog]) {
      assert.doesNotMatch(src, /supabase|fetch\(|document\.cookie|server-only/)
    }
  })
})
