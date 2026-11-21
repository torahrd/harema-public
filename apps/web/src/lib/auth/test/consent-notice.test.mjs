// 改定のお知らせ(同意の取り直し)の判定と記録(lib/auth/consent-notice.ts)と、画面・配線(ソースを読む検査)。
// 実行: `pnpm --filter web test`。DB の判定そのものは pgTAP(15_agreement_current.sql)が守る。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { hasAgreedToCurrent, isConsentNoticeDue, recordCurrentAgreement } from '../consent-notice.ts'
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
// notice: 見ていないお知らせ付きの改定が適用済みか(適用の前は false)。notice_due = notice かつ 本人の番号が足りない(DB の式)
const current = (agreed, notice = true) => ({
  data: [{ agreed, notice_due: notice && !agreed }],
  error: null,
})

describe('isConsentNoticeDue: DB の notice_due が真の時だけ出す', () => {
  it('notice_due 真なら true・偽なら false', async () => {
    assert.equal(await isConsentNoticeDue(fake({ current_agreement: current(false) })), true)
    assert.equal(await isConsentNoticeDue(fake({ current_agreement: current(true) })), false)
  })
  it('適用の前(お知らせ付きの改定がまだ適用されていない = notice false)は、番号の無い人にも出さない', async () => {
    assert.equal(await isConsentNoticeDue(fake({ current_agreement: current(false, false) })), false)
  })
  it('判定の失敗(エラー・投げる・行が無い・形が違う)は出さない側に倒す', async () => {
    assert.equal(await isConsentNoticeDue(fake({ current_agreement: { data: null, error: { message: 'x' } } })), false)
    assert.equal(await isConsentNoticeDue(fake({ current_agreement: new Error('net') })), false)
    assert.equal(await isConsentNoticeDue(fake({ current_agreement: { data: [], error: null } })), false)
    assert.equal(await isConsentNoticeDue(fake({ current_agreement: { data: [{ agreed: 'no' }], error: null } })), false)
  })
  it('client からは何も渡さない(番号・時刻・ID は DB が決める)', async () => {
    const c = fake({ current_agreement: current(false) })
    await isConsentNoticeDue(c)
    assert.deepEqual(c.calls, [['current_agreement', undefined]])
  })
})

describe('hasAgreedToCurrent: 今のバージョンに同意済みの時だけ true(言語の cookie を書く守りの最後の段)', () => {
  it('agreed が true の行だけ true・false は false', async () => {
    assert.equal(await hasAgreedToCurrent(fake({ current_agreement: current(true) })), true)
    assert.equal(await hasAgreedToCurrent(fake({ current_agreement: current(false) })), false)
    assert.equal(await hasAgreedToCurrent(fake({ current_agreement: current(false, false) })), false)
  })
  it('0 行・error あり・投げる・agreed が文字列の true は false(書かない側に倒す)', async () => {
    assert.equal(await hasAgreedToCurrent(fake({ current_agreement: { data: [], error: null } })), false)
    assert.equal(await hasAgreedToCurrent(fake({ current_agreement: { data: null, error: { message: 'x' } } })), false)
    assert.equal(await hasAgreedToCurrent(fake({ current_agreement: { data: [], error: {} } })), false)
    assert.equal(await hasAgreedToCurrent(fake({ current_agreement: new Error('net') })), false)
    assert.equal(
      await hasAgreedToCurrent(
        fake({
          current_agreement: {
            data: [{ agreed: 'true', notice_due: false }],
            error: null,
          },
        }),
      ),
      false,
    )
  })
  it('形が正しい行(agreed:true・notice_due:false)は true', async () => {
    assert.equal(
      await hasAgreedToCurrent(fake({ current_agreement: { data: [{ agreed: true, notice_due: false }], error: null } })),
      true,
    )
  })
})

describe('recordCurrentAgreement: record_agreement を引数なしで 1 回だけ呼ぶ', () => {
  it('record_agreement を引数なしで 1 回だけ呼ぶ(current_agreement を呼ばない・番号を送らない)', async () => {
    const c = fake({ record_agreement: { data: 'recorded', error: null } })
    assert.equal(await recordCurrentAgreement(c), 'recorded')
    assert.deepEqual(c.calls, [['record_agreement', undefined]])
  })
  it('already はそのまま返す', async () => {
    const c = fake({ record_agreement: { data: 'already', error: null } })
    assert.equal(await recordCurrentAgreement(c), 'already')
    assert.equal(c.calls.length, 1)
  })
  it('unregistered(どちらの行も無い・削除中の印)は skipped', async () => {
    assert.equal(await recordCurrentAgreement(fake({ record_agreement: { data: 'unregistered', error: null } })), 'skipped')
  })
  it('未知の値・boolean・null・エラー・投げるは failed で、投げない', async () => {
    for (const data of ['ok', true, false, null, undefined]) {
      assert.equal(await recordCurrentAgreement(fake({ record_agreement: { data, error: null } })), 'failed', String(data))
    }
    assert.equal(await recordCurrentAgreement(fake({ record_agreement: { data: null, error: { message: 'x' } } })), 'failed')
    assert.equal(await recordCurrentAgreement(fake({ record_agreement: new Error('net') })), 'failed')
  })
})

describe('画面と配線(ソースを読む検査)', () => {
  const dialog = code('../../../app/map/consent-notice-dialog.tsx')
  const screen = code('../../../app/map/map-screen.tsx')
  const page = code('../../../app/(app)/map/page.tsx')
  const action = code('../../../app/map/consent-actions.ts')

  it('page.tsx は判定の結果を MapScreen へ渡す(判定は supabase の client で行う)', () => {
    assert.match(page, /isConsentNoticeDue\(supabase\)/)
    assert.match(page, /consentNoticeDue=\{consentNoticeDue\}/)
  })
  it('map-screen は consentOpen の間だけ出し、同時に「ホーム画面に追加」を出さない', () => {
    assert.match(screen, /\{consentOpen && <ConsentNoticeDialog/)
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
  it('日付は shared の定数から作る(本文に日付を書かない)', () => {
    assert.match(dialog, /date: LEGAL_NOTICE_EFFECTIVE_ON/)
    assert.doesNotMatch(dialog, /2026\.\d\d\.\d\d/)
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
  })
  it('「続ける」は failed と skipped(記録の相手が無い)で { ok: false }', () => {
    assert.match(action, /result !== 'recorded' && result !== 'already'\) return \{ ok: false \}/)
  })
})

describe('辞書(web と iOS で同じ鍵)', () => {
  const keys = ['title', 'body1', 'body2', 'continue', 'declineLogout']
  it('ja・en に同じ 5 つの鍵が在り、日本語に「版」の語が無い', () => {
    assert.deepEqual(Object.keys(ja.web.consentNotice).sort(), [...keys].sort())
    assert.deepEqual(Object.keys(en.web.consentNotice).sort(), [...keys].sort())
    assert.ok(!JSON.stringify(ja.web.consentNotice).includes('版'))
  })
  it('{date} は ja・en の body1 の両方にある', () => {
    assert.ok(ja.web.consentNotice.body1.includes('{date}'))
    assert.ok(en.web.consentNotice.body1.includes('{date}'))
  })
})
