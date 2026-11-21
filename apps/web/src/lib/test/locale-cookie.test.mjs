// 言語の手動の切り替え(web)。選んだ言語の cookie の決め方・属性・書く道(setLocale・ログインの受付の refreshLocaleCookie)と読む道が決めた所だけであること。
// 実行: `pnpm --filter web test`。実際の Set-Cookie・応答の Cache-Control は next start に curl/Playwright で確かめる(PR の記録)。
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, it } from 'node:test'
import { LOCALE_NAMES } from '@harema/shared/i18n'
import { LEGAL_EFFECTIVE_AT } from '@harema/shared/constants'
import { LOCALE_COOKIE_NAME, localeCookieAttributes, localeCookieWritable, parseLoginLang, refreshLocaleCookie, resolveLocale } from '../../i18n/locale-cookie.ts'
import { setLocaleIfAgreed } from '../../i18n/set-locale-core.ts'

const webSrc = fileURLToPath(new URL('../../', import.meta.url))
const read = (rel) => readFileSync(path.join(webSrc, rel), 'utf8')
const BOTH = ['ja', 'en']

describe('T13 resolveLocale: 選んだ言語が Accept-Language に勝ち、許可リストの外は無い物', () => {
  it('cookie が Accept-Language に勝つ', () => {
    assert.equal(resolveLocale('en', 'ja', BOTH), 'en')
    assert.equal(resolveLocale('ja', 'en-US', BOTH), 'ja')
  })
  it('許可リストの外・空・無しは Accept-Language に従う', () => {
    for (const bad of ['fr', 'EN', 'en"><script>', '', undefined, null]) {
      assert.equal(resolveLocale(bad, 'en-US', BOTH), 'en', String(bad))
      assert.equal(resolveLocale(bad, 'ja', BOTH), 'ja', String(bad))
    }
  })
  it('有効な言語が ja だけなら en の cookie は使わない', () => {
    assert.equal(resolveLocale('en', 'ja', ['ja']), 'ja')
  })
  it('どちらも無ければ ja', () => {
    assert.equal(resolveLocale(undefined, null, BOTH), 'ja')
  })
  it('返すのは定数だけ(cookie の値をそのまま返さない)', () => {
    assert.ok(BOTH.includes(resolveLocale('en"><script>', null, BOTH)))
  })
})

describe('T14(1) localeCookieAttributes', () => {
  it('決めた属性。domain の鍵が無い', () => {
    assert.deepEqual(localeCookieAttributes(false), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
      maxAge: 31536000,
    })
    assert.equal(localeCookieAttributes(true).secure, true)
    assert.ok(!('domain' in localeCookieAttributes(true)))
  })
  it('名前', () => {
    assert.equal(LOCALE_COOKIE_NAME, 'harema_locale')
  })
})

describe('T19 ログインを受け付けた応答で言語の cookie を書く(同意の記録に成功した時だけ・所有者 2026-11-21)', () => {
  const AFTER = Date.parse(LEGAL_EFFECTIVE_AT) + 1000
  const run = (value, login, now = AFTER) => {
    const sets = []
    const request = { cookies: { get: (name) => (name === LOCALE_COOKIE_NAME && value !== undefined ? { value } : undefined) } }
    const response = { cookies: { set: (...args) => sets.push(args) } }
    refreshLocaleCookie(request, response, true, login, now)
    return sets
  }
  const OK = { agreed: true, chosen: null }
  it('同意の記録に成功した時: cookie の有効な値なら同じ値で 1 年の属性に張り直す', () => {
    assert.deepEqual(run('en', OK), [[LOCALE_COOKIE_NAME, 'en', localeCookieAttributes(true)]])
    assert.deepEqual(run('ja', OK), [[LOCALE_COOKIE_NAME, 'ja', localeCookieAttributes(true)]])
  })
  it('同意の記録に成功していない時(失敗・目印が無い)は、cookie が有効でも・選んだ言語があっても何も書かない', () => {
    assert.deepEqual(run('en', { agreed: false, chosen: null }), [])
    assert.deepEqual(run('en', { agreed: false, chosen: 'ja' }), [])
    assert.deepEqual(run(undefined, { agreed: false, chosen: 'en' }), [])
  })
  it('同意の記録に成功した時: ログイン画面で選んだ言語を、端末の cookie の値より先に書く(新しく作る)', () => {
    assert.deepEqual(run(undefined, { agreed: true, chosen: 'en' }), [[LOCALE_COOKIE_NAME, 'en', localeCookieAttributes(true)]])
    assert.deepEqual(run('ja', { agreed: true, chosen: 'en' }), [[LOCALE_COOKIE_NAME, 'en', localeCookieAttributes(true)]])
  })
  it('選んだ言語も無く、cookie が無い・許可リストの外の値なら何も書かない', () => {
    assert.deepEqual(run(undefined, OK), [])
    assert.deepEqual(run('fr', OK), [])
    assert.deepEqual(run('en; Domain=evil', OK), [])
    assert.deepEqual(run('', OK), [])
  })
  it('適用の日時より前は何もしない・ちょうどとその後は書く(サーバの時刻)', () => {
    const at = Date.parse(LEGAL_EFFECTIVE_AT)
    assert.deepEqual(run('en', OK, at - 1), [])
    assert.deepEqual(run('ja', { agreed: true, chosen: 'en' }, 0), [])
    assert.equal(run('en', OK, at).length, 1)
    assert.equal(run('en', OK, at + 86_400_000).length, 1)
  })
  it('/auth/session は受け付けた応答でだけ呼び、同意の記録の結果(recorded・already)だけを agreed にする', () => {
    const src = read('app/auth/session/route.ts')
    const call = src.indexOf('refreshLocaleCookie(')
    const reject = src.indexOf('if (!result.ok) {')
    const sessionSet = src.indexOf('response.cookies.set(')
    assert.ok(reject > 0 && sessionSet > reject && call > sessionSet)
    assert.equal(src.split('refreshLocaleCookie(').length - 1, 1)
    assert.ok(!src.includes('LOCALE_COOKIE_NAME'))
    assert.ok(src.includes("agreed: result.agreement === 'recorded' || result.agreement === 'already'"))
    assert.ok(src.includes('localeSchema.safeParse(result.requestedLocale)'))
  })
  it('skipped(記録の相手が無い・目印が無い)と failed は書かない: route の agreed の式を、結果ごとに評価する', () => {
    const src = read('app/auth/session/route.ts')
    const expr = /agreed:\s*(result\.agreement === 'recorded' \|\| result\.agreement === 'already'),/.exec(src)?.[1]
    assert.ok(expr, 'agreed の式が見つからない(式の終わりの , までを見る。後ろに項を足すと見つからない)')
    const agreedFor = (agreement) => new Function('result', `return ${expr}`)({ agreement })
    assert.equal(agreedFor('recorded'), true)
    assert.equal(agreedFor('already'), true)
    assert.equal(agreedFor('skipped'), false)
    assert.equal(agreedFor('failed'), false)
    // agreed が偽なら、cookie が有効でも・選んだ言語があっても何も書かない(上の it)
    assert.deepEqual(run('en', { agreed: agreedFor('skipped'), chosen: 'ja' }), [])
  })
})

describe('T21 setLocale: 未ログイン・未同意は書かず、ログイン済みで今のバージョンに同意した人だけ書く(所有者 2026-11-21)', () => {
  /** 依存のスパイ。書いた値を残す。 */
  const make = ({ writable = true, user = true, agreed = true, userThrows = false, agreedThrows = false } = {}) => {
    const writes = []
    const calls = []
    return {
      writes,
      calls,
      deps: {
        writable: () => (calls.push('writable'), writable),
        hasVerifiedUser: async () => {
          calls.push('user')
          if (userThrows) throw new Error('x')
          return user
        },
        hasAgreedToCurrent: async () => {
          calls.push('agreed')
          if (agreedThrows) throw new Error('x')
          return agreed
        },
        write: (locale) => void writes.push(locale),
      },
    }
  }
  it('ログイン済み・同意済み・適用の後: 書く', async () => {
    const { deps, writes } = make()
    assert.deepEqual(await setLocaleIfAgreed('en', deps), { ok: true })
    assert.deepEqual(writes, ['en'])
  })
  it('未ログイン: 書かない({ ok: false })。同意の問い合わせもしない', async () => {
    const { deps, writes, calls } = make({ user: false })
    assert.deepEqual(await setLocaleIfAgreed('en', deps), { ok: false })
    assert.deepEqual(writes, [])
    assert.ok(!calls.includes('agreed'))
  })
  it('ログイン済み・未同意(今のバージョンに同意していない): 書かない', async () => {
    const { deps, writes } = make({ agreed: false })
    assert.deepEqual(await setLocaleIfAgreed('ja', deps), { ok: false })
    assert.deepEqual(writes, [])
  })
  it('適用の日時より前: 書かない(同意済みでも)', async () => {
    const { deps, writes } = make({ writable: false })
    assert.deepEqual(await setLocaleIfAgreed('en', deps), { ok: false })
    assert.deepEqual(writes, [])
  })
  it('許可リストの外の値: 書かない・依存を呼ばない', async () => {
    for (const bad of ['fr', 'EN', '', null, undefined, 1, { a: 1 }]) {
      const { deps, writes, calls } = make()
      assert.deepEqual(await setLocaleIfAgreed(bad, deps), { ok: false }, String(bad))
      assert.deepEqual(writes, [])
      assert.deepEqual(calls, [])
    }
  })
  it('判定の依存が投げても、投げずに { ok: false }・書かない', async () => {
    for (const opts of [{ userThrows: true }, { agreedThrows: true }]) {
      const { deps, writes } = make(opts)
      assert.deepEqual(await setLocaleIfAgreed('en', deps), { ok: false })
      assert.deepEqual(writes, [])
    }
  })
  it('actions.ts は本物の依存(getVerifiedUser・hasAgreedToCurrent・適用の日時の門)を核へ渡し、cookie の書き込みは write の中だけ', () => {
    const src = read('i18n/actions.ts')
    assert.ok(src.includes('setLocaleIfAgreed('))
    assert.ok(src.includes('getVerifiedUser()'))
    assert.ok(src.includes('hasAgreedToCurrent(await createUserSupabase())'))
    assert.ok(src.includes('localeCookieWritable()'))
    assert.equal(src.split('store.set(').length - 1, 1)
    assert.ok(src.indexOf('store.set(') > src.indexOf('write: async'))
    assert.ok(!read('i18n/set-locale-core.ts').includes("from 'next"))
  })
  it('hasAgreedToCurrent は DB の current_agreement の agreed だけを見て、失敗は false', () => {
    const src = read('lib/auth/consent-notice.ts')
    assert.match(src, /export async function hasAgreedToCurrent\(client: Client\): Promise<boolean> \{[\s\S]*?row\.agreed === true[\s\S]*?return false/)
  })
})

describe('T22 ログイン画面の言語の切り替えは cookie を書かず、?lang= で表示だけを替える(所有者 2026-11-21)', () => {
  it('parseLoginLang: ja・en だけ。外れた値・複数・無しは null', () => {
    assert.equal(parseLoginLang('en'), 'en')
    assert.equal(parseLoginLang('ja'), 'ja')
    for (const bad of ['fr', 'EN', '', undefined, null, ['en'], ['en', 'ja'], 'en"><script>']) {
      assert.equal(parseLoginLang(bad), null, String(bad))
    }
  })
  it('ログイン画面: ?lang= を searchParams から読み、辞書と言語をこの画面の中で差し替える。cookie を読み書きしない', () => {
    const src = read('app/(app)/login/page.tsx')
    assert.match(src, /searchParams: Promise<\{ lang\?: string \| string\[\] \}>/)
    assert.ok(src.includes('parseLoginLang((await searchParams).lang)'))
    assert.ok(src.includes('<NextIntlClientProvider locale={locale} messages={messagesForLocale}>'))
    assert.ok(src.includes('createTranslator('))
    assert.ok(src.includes('lang={locale}'))
    assert.ok(src.includes('chosenLocale: chosen'))
    for (const word of ['cookies(', 'next/headers', 'LOCALE_COOKIE_NAME', 'setLocale']) assert.ok(!src.includes(word), word)
  })
  it('LangSwitch の head は setLocale を呼ばず、URL の ?lang= を替える。row だけが setLocale を呼ぶ', () => {
    const src = read('app/_ui/lang-switch.tsx')
    const head = src.indexOf("if (variant === 'head') {")
    const action = src.indexOf('await setLocale(next)')
    assert.ok(head > 0 && action > head)
    const headBlock = src.slice(head, action)
    assert.ok(headBlock.includes('router.replace(`${pathname}?lang=${next}`)'))
    assert.ok(headBlock.includes('return'))
    assert.ok(!headBlock.includes('setLocale'))
  })
  it('ログインの画面から受付へ: 選んだ時だけ locale を本文に入れる(LoginForm → loginWithSso → runSsoLogin)', () => {
    assert.ok(read('app/login/login-form.tsx').includes('loginWithSso(provider, chosenLocale)'))
    const client = read('app/login/login-client.ts')
    assert.ok(client.includes('...(locale !== undefined ? { locale } : {})'))
    assert.ok(!client.includes('document.cookie'))
  })
})

describe('T20 言語の cookie を書く門(適用の日時 LEGAL_EFFECTIVE_AT・サーバの時刻)', () => {
  const at = Date.parse(LEGAL_EFFECTIVE_AT)
  it('前は書けず、ちょうどと後は書ける', () => {
    assert.equal(localeCookieWritable(at - 1), false)
    assert.equal(localeCookieWritable(at), true)
    assert.equal(localeCookieWritable(at + 1), true)
  })
  it('既定の引数は今の時刻(呼ぶ側が時計を渡さない)', () => {
    assert.equal(localeCookieWritable(), Date.now() >= at)
  })
  it('setLocale は門を通らなければ { ok: false } を返す(核が、依存の問い合わせと書き込みより前に判定する)', () => {
    const core = read('i18n/set-locale-core.ts')
    const gate = core.indexOf('if (!deps.writable()) return { ok: false }')
    assert.ok(gate > 0 && core.indexOf('deps.hasVerifiedUser()') > gate && core.indexOf('deps.write(') > gate)
    assert.ok(read('i18n/actions.ts').includes('writable: () => localeCookieWritable()'))
  })
  it('適用の前は言語の切り替えの部品を出さない(ログイン画面の頭・メニューの行)。判定はサーバのコードで、サーバの時刻', () => {
    const login = read('app/(app)/login/page.tsx')
    assert.match(login, /\{localeCookieWritable\(\) && <LangSwitch variant="head" \/>\}/)
    const page = read('app/(app)/map/page.tsx')
    assert.match(page, /languageSwitch=\{localeCookieWritable\(\)\}/)
    assert.match(read('app/map/map-screen.tsx'), /showLanguageSwitch=\{languageSwitch\}/)
    const drawer = read('app/account/drawer.tsx')
    assert.match(drawer, /\{showLanguageSwitch && \(\s*<div className="qs-it qs-it-lang">/)
    // 判定を client の部品(時計・props の既定)に任せない
    assert.ok(!read('app/_ui/lang-switch.tsx').includes('localeCookieWritable'))
  })
  it('cookie を読む側(request.ts)は門を持たない(Accept-Language で英語は出る)', () => {
    assert.ok(!read('i18n/request.ts').includes('localeCookieWritable'))
  })
})

describe('T18 言語の cookie を書く・読む道が決めた所だけ', () => {
  const files = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'test' || e.name === 'tests') continue
        walk(p)
      } else if (/\.(ts|tsx|css)$/.test(e.name)) files.push(p)
    }
  }
  walk(webSrc)
  const rel = (f) => path.relative(webSrc, f).split(path.sep).join('/')

  // app/_public/legal.ts はポリシーの本文(docs/legal/privacy.md から生成)で、利用者に cookie の名前を示す文だけを持つ。
  it('cookie の名前の文字列は locale-cookie.ts にだけある(ポリシーの本文を除く)', () => {
    const allowed = new Set(['i18n/locale-cookie.ts', 'app/_public/legal.ts'])
    const hits = files.filter((f) => !allowed.has(rel(f)) && readFileSync(f, 'utf8').includes('harema_locale'))
    assert.deepEqual(hits.map(rel), [])
    // 除いた生成物はデータだけ(import を持たない = cookie を読み書きする道を持てない)。
    assert.ok(!/^\s*import\b/m.test(read('app/_public/legal.ts')))
  })
  it('refreshLocaleCookie を呼ぶのはログインの受付(app/auth/session/route.ts)だけ(書くのは同意の記録に成功した時だけ・T19)', () => {
    const hits = files.filter((f) => rel(f) !== 'i18n/locale-cookie.ts' && readFileSync(f, 'utf8').includes('refreshLocaleCookie'))
    assert.deepEqual(hits.map(rel), ['app/auth/session/route.ts'])
  })
  it('ブラウザの JS で cookie を書く道が無い', () => {
    const hits = files.filter((f) => readFileSync(f, 'utf8').includes('document.cookie'))
    assert.deepEqual(hits.map(rel), [])
  })
  it('LOCALE_COOKIE_NAME を import するのは request.ts と actions.ts だけ', () => {
    const hits = files.filter((f) => {
      const r = rel(f)
      return r !== 'i18n/locale-cookie.ts' && readFileSync(f, 'utf8').includes('LOCALE_COOKIE_NAME')
    })
    assert.deepEqual(hits.map(rel).sort(), ['i18n/actions.ts', 'i18n/request.ts'])
  })
  it('actions.ts: 検証を通した値だけを決めた属性で、ログイン済みで同意した人にだけ書く。転送の道を持たない', () => {
    const src = read('i18n/actions.ts')
    assert.ok(read('i18n/set-locale-core.ts').includes('localeSchema.safeParse'))
    assert.ok(src.includes('localeCookieAttributes('))
    assert.ok(src.includes('localeCookieAttributes(isSecureCookie())'))
    assert.match(src, /import \{[^}]*isSecureCookie[^}]*\} from '@\/lib\/auth\/session'/)
    assert.ok(!src.includes('redirect'))
    // 書く前の判定(T21 が振る舞いを見る): 検証済みのログイン + 今のバージョンへの同意
    assert.ok(src.includes('getVerifiedUser'))
    assert.ok(src.includes('hasAgreedToCurrent'))
  })
  it('request.ts は resolveLocale を通す', () => {
    assert.ok(read('i18n/request.ts').includes('resolveLocale('))
  })
  it('lang-switch.tsx: 呼び出しを try で包み、cookie は Server Action で書く', () => {
    const src = read('app/_ui/lang-switch.tsx')
    assert.ok(src.includes('try {'))
    assert.ok(src.includes('setLocale('))
  })
  it('読み直しの配線: メニューは成功の後に頁全体を読み直し、ログイン画面は読み直さない(L-2・B32)', () => {
    assert.ok(read('app/account/drawer.tsx').includes('<LangSwitch variant="row" reload'))
    assert.ok(!/<LangSwitch[^>]*reload/.test(read('app/(app)/login/page.tsx')))
    const sw = read('app/_ui/lang-switch.tsx')
    assert.ok(sw.includes('if (result.ok && reload) {'))
    assert.ok(sw.includes('window.location.reload()'))
    assert.ok(sw.includes('if (!reloading) {'))
  })
  it('メニューの切り替えはログアウトの往復の間は押せない', () => {
    assert.ok(read('app/account/drawer.tsx').includes('disabled={pendingLogout} onPendingChange={setPendingLang} />'))
    assert.ok(read('app/_ui/lang-switch.tsx').includes('disabled={pending || disabled}'))
  })
  it('メニューは言語の切り替えの往復の間ログアウトを押せない', () => {
    const drawer = read('app/account/drawer.tsx')
    assert.ok(drawer.includes('if (pendingLogout || pendingLang) return'))
    assert.ok(drawer.includes('disabled={pendingLogout || pendingLang}'))
    assert.ok(read('app/_ui/lang-switch.tsx').includes('onPendingChange?.(false)'))
  })
  it('公開ページ((site))は言語の cookie を読まない(静的のまま)', () => {
    const hits = files.filter(
      (f) => rel(f).startsWith('app/(site)/') && /i18n\/(request|actions)|LOCALE_COOKIE_NAME/.test(readFileSync(f, 'utf8')),
    )
    assert.deepEqual(hits.map(rel), [])
  })
  it('自称の名前は定数。ja・en の 2 つ', () => {
    assert.deepEqual(LOCALE_NAMES, { ja: '日本語', en: 'English' })
  })
})
