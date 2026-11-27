// 改定のお知らせ(同意の取り直し)の判定と記録(lib/auth/consent-notice.ts)と、画面・配線(ソースを読む検査)。
// 実行: `pnpm --filter web test`。DB の判定そのものは pgTAP(15_agreement_current.sql)が守る。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { hasAgreedToCurrent, isConsentNoticeDue, readAgreementState, recordCurrentAgreement } from '../consent-notice.ts'
import { noticeParagraphs } from '../../../../../../packages/shared/validations/agreement.ts'
import { ja } from '../../../../../../packages/shared/i18n/ja.ts'
import { en } from '../../../../../../packages/shared/i18n/en.ts'

const code = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// rpc のふりをする client。呼ばれた名前と引数を calls に残す。
function fake(handlers) {
  const calls = []
  return {
    calls,
    rpc(name, args) {
      calls.push([name, args])
      const h = handlers[name]
      const result = typeof h === 'function' ? h(args) : h
      const p = Promise.resolve(result)
      p.abortSignal = () => p
      if (result instanceof Error) {
        const rejected = Promise.reject(result)
        rejected.catch(() => {})
        rejected.abortSignal = () => rejected
        return rejected
      }
      return p
    },
  }
}
const NOTICE_JA = ['本文 {date} 1', '本文 2']
const NOTICE_EN = ['Body {date} 1', 'Body 2']
// agreement_state の 1 行。お知らせが要る(notice_due 真)なら文を持つ。
const row = (over = {}) => ({
  agreed: false,
  notice_due: true,
  notice_effective_on: '2026.11.29',
  notice_ja: NOTICE_JA,
  notice_en: NOTICE_EN,
  lists_open: false,
  ...over,
})
const state = (over) => ({ data: [row(over)], error: null })
const closedRow = { agreed: true, notice_due: false, notice_effective_on: null, notice_ja: null, notice_en: null, lists_open: true }

describe('readAgreementState: DB の agreement_state の 1 行を、画面が読む形にする', () => {
  it('お知らせが要る行は、文(日付は未置換)・適用の日・listsOpen を返す', async () => {
    const s = await readAgreementState(fake({ agreement_state: state({ lists_open: false }) }))
    assert.deepEqual(s, {
      agreed: false,
      notice: { effectiveOn: '2026.11.29', ja: NOTICE_JA, en: NOTICE_EN },
      listsOpen: false,
    })
  })
  it('同意済みで開いている行は、notice は null・listsOpen は真', async () => {
    const s = await readAgreementState(fake({ agreement_state: { data: [closedRow], error: null } }))
    assert.deepEqual(s, { agreed: true, notice: null, listsOpen: true })
  })
  it('client からは何も渡さない(番号・時刻・ID は DB が決める)・agreement_state を 1 回だけ呼ぶ', async () => {
    const c = fake({ agreement_state: state() })
    await readAgreementState(c)
    assert.deepEqual(c.calls, [['agreement_state', undefined]])
  })
  it('読みの失敗(エラー・投げる・行が無い・形が違う)は、お知らせなし・リストは開かない側(listsOpen: false)', async () => {
    const closed = { agreed: false, notice: null, listsOpen: false }
    assert.deepEqual(await readAgreementState(fake({ agreement_state: { data: null, error: { message: 'x' } } })), closed)
    assert.deepEqual(await readAgreementState(fake({ agreement_state: new Error('net') })), closed)
    assert.deepEqual(await readAgreementState(fake({ agreement_state: { data: [], error: null } })), closed)
    assert.deepEqual(await readAgreementState(fake({ agreement_state: { data: [{ agreed: 'no' }], error: null } })), closed)
    // lists_open が真でも、形が違えば開かない
    assert.deepEqual(
      await readAgreementState(fake({ agreement_state: { data: [{ ...closedRow, agreed: 'true' }], error: null } })),
      closed,
    )
    assert.deepEqual(
      await readAgreementState(fake({ agreement_state: { data: [{ ...closedRow, notice_effective_on: '11/29' }], error: null } })),
      closed,
    )
  })
  it('お知らせが要るのに文が無い行は、notice: null・listsOpen: false(出せないまま開かない)', async () => {
    for (const over of [{ notice_ja: null }, { notice_en: null }, { notice_effective_on: null }, { lists_open: true, notice_ja: null }]) {
      const s = await readAgreementState(fake({ agreement_state: state(over) }))
      assert.equal(s.notice, null, JSON.stringify(over))
      assert.equal(s.listsOpen, false, JSON.stringify(over))
    }
  })
})

describe('isConsentNoticeDue: 出せる文が在る時だけ出す', () => {
  it('お知らせが要る行(文あり)は true・同意済みの行は false', async () => {
    assert.equal(await isConsentNoticeDue(fake({ agreement_state: state() })), true)
    assert.equal(await isConsentNoticeDue(fake({ agreement_state: { data: [closedRow], error: null } })), false)
  })
  it('判定の失敗(エラー・投げる・行が無い・形が違う)は出さない側に倒す', async () => {
    assert.equal(await isConsentNoticeDue(fake({ agreement_state: { data: null, error: { message: 'x' } } })), false)
    assert.equal(await isConsentNoticeDue(fake({ agreement_state: new Error('net') })), false)
    assert.equal(await isConsentNoticeDue(fake({ agreement_state: { data: [], error: null } })), false)
  })
})

describe('noticeParagraphs: 表示言語の段落に、適用の日を埋める', () => {
  const notice = { effectiveOn: '2026.11.29', ja: NOTICE_JA, en: NOTICE_EN }
  it('日本語・英語それぞれの段落の {date} を適用の日で埋める', () => {
    assert.deepEqual(noticeParagraphs(notice, 'ja'), ['本文 2026.11.29 1', '本文 2'])
    assert.deepEqual(noticeParagraphs(notice, 'en'), ['Body 2026.11.29 1', 'Body 2'])
  })
  it('英語以外の言語は日本語', () => {
    assert.deepEqual(noticeParagraphs(notice, 'fr'), ['本文 2026.11.29 1', '本文 2'])
  })
})

describe('hasAgreedToCurrent: 今のバージョンに同意済みの時だけ true(言語の cookie を書く守りの最後の段)', () => {
  it('agreed が true の行だけ true・false は false', async () => {
    assert.equal(await hasAgreedToCurrent(fake({ agreement_state: { data: [closedRow], error: null } })), true)
    assert.equal(await hasAgreedToCurrent(fake({ agreement_state: state() })), false)
  })
  it('0 行・error あり・投げる・agreed が文字列の true は false(書かない側に倒す)', async () => {
    assert.equal(await hasAgreedToCurrent(fake({ agreement_state: { data: [], error: null } })), false)
    assert.equal(await hasAgreedToCurrent(fake({ agreement_state: { data: null, error: { message: 'x' } } })), false)
    assert.equal(await hasAgreedToCurrent(fake({ agreement_state: { data: [], error: {} } })), false)
    assert.equal(await hasAgreedToCurrent(fake({ agreement_state: new Error('net') })), false)
    assert.equal(await hasAgreedToCurrent(fake({ agreement_state: { data: [{ ...closedRow, agreed: 'true' }], error: null } })), false)
  })
})

describe('recordCurrentAgreement: agree_current を引数なしで 1 回だけ呼ぶ', () => {
  it('agree_current を引数なしで 1 回だけ呼ぶ(agreement_state を呼ばない・番号を送らない)', async () => {
    const c = fake({ agree_current: { data: 'recorded', error: null } })
    assert.equal(await recordCurrentAgreement(c), 'recorded')
    assert.deepEqual(c.calls, [['agree_current', undefined]])
  })
  it('already はそのまま返す', async () => {
    const c = fake({ agree_current: { data: 'already', error: null } })
    assert.equal(await recordCurrentAgreement(c), 'already')
    assert.equal(c.calls.length, 1)
  })
  it('unregistered(どちらの行も無い・削除中の印)は skipped', async () => {
    assert.equal(await recordCurrentAgreement(fake({ agree_current: { data: 'unregistered', error: null } })), 'skipped')
  })
  it('未知の値・boolean・null・エラー・投げるは failed で、投げない', async () => {
    for (const data of ['ok', true, false, null, undefined]) {
      assert.equal(await recordCurrentAgreement(fake({ agree_current: { data, error: null } })), 'failed', String(data))
    }
    assert.equal(await recordCurrentAgreement(fake({ agree_current: { data: null, error: { message: 'x' } } })), 'failed')
    assert.equal(await recordCurrentAgreement(fake({ agree_current: new Error('net') })), 'failed')
  })
})

describe('画面と配線(ソースを読む検査)', () => {
  const dialog = code('../../../app/map/consent-notice-dialog.tsx')
  const screen = code('../../../app/map/map-screen.tsx')
  const page = code('../../../app/(app)/map/page.tsx')
  const action = code('../../../app/map/consent-actions.ts')

  it('page.tsx は同意の状態(agreement_state)を読み、お知らせの文(表示言語の段落)と枠の件の文と listsOpen を MapScreen へ渡す', () => {
    assert.match(page, /readAgreementState\(supabase\)/)
    assert.match(page, /paragraphs: noticeParagraphs\(agreement\.notice, locale\)/)
    // 枠の文: news.ts の notice を持つ件を適用の日で引き、LP と同じ切り替え(newsText)で選ぶ。時計は requestTime() だけ。件が無ければ news は null
    assert.match(page, /noticeNewsItem\(agreement\.notice\.effectiveOn\)/)
    assert.match(page, /news: item === null \? null : newsText\(item, matchLocale\(\[locale\]\), await requestTime\(\)\)/)
    assert.doesNotMatch(page, /Date\.now/)
    assert.match(page, /consentNotice=\{consentNotice\}/)
    assert.match(page, /listsOpen=\{listsOpen\}/)
  })
  it('map-screen は consentOpen の間だけ出し、同時に「ホーム画面に追加」を出さない', () => {
    assert.match(screen, /\{consentOpen && consentNotice !== null && \(\s*<ConsentNoticeDialog notice=\{consentNotice\}/)
    assert.match(screen, /!consentOpen &&\s*installPrompt\.modalDue/)
  })
  it('器の外を押しても閉じない(スクリムに onClick が無い)', () => {
    const scrim = dialog.slice(dialog.indexOf('qs qs-scrim') - 120, dialog.indexOf('qs qs-scrim') + 200)
    assert.doesNotMatch(scrim, /onClick/)
  })
  it('「続ける」はチェックが付くまで押せない', () => {
    assert.match(dialog, /disabled=\{!checked \|\| pending !== null\}/)
    assert.match(dialog, /if \(!checked \|\| pending\) return/)
  })
  it('「続ける」は Server Action で記録し、失敗は閉じずに今ある失敗の表示(ActionError)を出す', () => {
    assert.match(dialog, /agreeToCurrentRevision\(\)/)
    assert.match(dialog, /ActionError lines=\{asLines\(common\.raw\('errorTryLater'\)\)\}/)
    assert.match(dialog, /if \(result\.ok\) \{\s*onAgreed\(\)/)
  })
  it('ログアウトは今のログアウトと同じ(印を置いて signOut・失敗は印を消して logoutError)', () => {
    assert.match(dialog, /markLpNotice\('logout'\)/)
    assert.match(dialog, /await signOut\(\)/)
    assert.match(dialog, /unstable_rethrow\(e\)/)
    assert.match(dialog, /clearLpNotice\(\)/)
    assert.match(dialog, /drawer\.raw\('logoutError'\)/)
  })
  it('本文は props の段落から描く(本文も日付も画面に書かない・辞書から読まない)', () => {
    assert.match(dialog, /notice\.paragraphs\.map\(\(text, index\)/)
    assert.doesNotMatch(dialog, /t\('body[12]'/)
    assert.doesNotMatch(dialog, /LEGAL_NOTICE_EFFECTIVE_ON/)
    assert.doesNotMatch(dialog, /2026\.\d\d\.\d\d/)
  })
  it('枠: 件があるときだけ、説明(#consent-notice-body)の外に、LP と同じ部品(NewsSentence)の箇条書きで出す', () => {
    const bodyOpen = dialog.indexOf('<div id="consent-notice-body">')
    const bodyClose = dialog.indexOf('</div>', bodyOpen)
    const box = dialog.indexOf('<NoticeNewsBox')
    assert.ok(box > bodyClose, '枠は説明の div の後(外)')
    assert.match(dialog, /notice\.news !== null && \(\s*<NoticeNewsBox title=\{notice\.news\.title\}>/)
    assert.match(dialog, /<ul className="news-ul news-t">/)
    assert.match(dialog, /<NewsSentence text=\{text\} locale=\{locale\} \/>/)
    assert.doesNotMatch(dialog, /<p className="news-d"/)
  })
  it('枠の器: region・aria-label・tabIndex 0・高さ 176px 固定の中で動かし、標準のスクロールバーは隠して印を重ねる', () => {
    const box = code('../../../app/map/notice-news-box.tsx')
    assert.match(box, /role="region" aria-label=\{title\} tabIndex=\{0\}/)
    assert.match(box, /className="qs-nbx-thumb"/)
    assert.doesNotMatch(box, /Date\.now/)
    const css = readFileSync(new URL('../../../app/globals.css', import.meta.url), 'utf8')
    const inner = css.match(/\.qs-nbx-in \{([^}]*)\}/)?.[1] ?? ''
    for (const piece of ['height: 176px', 'overflow-y: auto', 'box-sizing: border-box', 'padding: 12px 14px', 'background: var(--qs-panel)', 'border: 1px solid var(--qs-panel-rule)', 'border-radius: var(--radius-control)', 'scrollbar-width: none']) {
      assert.ok(inner.includes(piece), piece)
    }
    assert.match(css, /\.qs-nbx \{ position: relative; margin-top: 12px; \}/)
    assert.match(css, /\.qs-nbx-in::-webkit-scrollbar \{ display: none; \}/)
    assert.match(css, /\.qs-nbx-thumb \{[^}]*right: 3px; width: 3px; border-radius: 2px; background: color-mix\(in srgb, var\(--qs-fg\) 32%, transparent\)/)
  })
  it('同意の行はログイン画面と同じ文(web.login.consentTerms)・同じリンク先', () => {
    assert.match(dialog, /login\.rich\('consentTerms'/)
    assert.match(dialog, /href=\{legalPath\(locale, 'terms'\)\}/)
    assert.match(dialog, /href=\{legalPath\(locale, 'privacy'\)\}/)
    assert.match(dialog, /const locale = matchLocale\(\[useLocale\(\)\]\)/)
  })
  it('Server Action は認可に getVerifiedUser を使い、クライアントから何も受けない', () => {
    assert.match(action, /export async function agreeToCurrentRevision\(\): Promise<\{ ok: boolean \}>/)
    assert.match(action, /getVerifiedUser\(\)/)
    assert.match(action, /recordCurrentAgreement\(await createUserSupabase\(\)\)/)
    assert.doesNotMatch(action, /record_agreement/)
  })
  it('「続ける」は failed と skipped(記録の相手が無い)で { ok: false }', () => {
    assert.match(action, /result !== 'recorded' && result !== 'already'\) return \{ ok: false \}/)
  })
})

describe('辞書(web と iOS で同じ鍵)', () => {
  const keys = ['title', 'continue', 'declineLogout']
  it('ja・en に同じ 3 つの鍵が在り、日本語に「版」の語が無い(本文は辞書に持たず DB の行から返す)', () => {
    assert.deepEqual(Object.keys(ja.web.consentNotice).sort(), [...keys].sort())
    assert.deepEqual(Object.keys(en.web.consentNotice).sort(), [...keys].sort())
    assert.ok(!JSON.stringify(ja.web.consentNotice).includes('版'))
  })
})
