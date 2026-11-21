// 英語の公開ページと、公開ページの言語の切り替え(PR4)。公開ページは静的のまま(要求を読まない・cookie を書かない)。
// build の後の HTML の確かめ(切り替えの行き先・Set-Cookie・日本語の混入)は、偽の env の next start に curl で行う(PR の記録)。
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { ja } from '../../app/_public/copy/ja.ts'
import { en } from '../../app/_public/copy/en.ts'

const APP = fileURLToPath(new URL('../../app/', import.meta.url))
const read = (rel) => readFileSync(join(APP, rel), 'utf8')

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'test' ? [] : sourceFiles(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

/** 値の形(キーの並びと、配列の長さ)。文字列は中身を見ない。 */
function shapeOf(value) {
  if (Array.isArray(value)) return value.map(shapeOf)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shapeOf(v)]))
  return typeof value
}

describe('公開ページの言語の切り替え(T21 の (4))', () => {
  const src = read('_public/lang-links.tsx')
  it('lang-links.tsx は Server Component で、cookie・Server Action・JavaScript を持たない', () => {
    // 正規表現が当たること(fixture)を先に確かめる。
    for (const [re, sample] of [[/document\.cookie/, 'document.cookie = x'], [/setLocale/, 'await setLocale(v)'], [/['"]use client['"]/, "'use client'"]]) assert.match(sample, re)
    assert.doesNotMatch(src, /document\.cookie/)
    assert.doesNotMatch(src, /setLocale/)
    assert.doesNotMatch(src, /['"]use client['"]/)
    assert.doesNotMatch(src, /next\/headers|cookies\(|headers\(/)
  })
  it('相手の言語の側だけが <Link> で、今の言語の側は aria-current の字(押せない)', () => {
    assert.match(src, /<Link\b[^>]*href=\{other\}/)
    assert.match(src, /<span\b[^>]*aria-current="true"/)
    assert.match(src, /otherLanguagePath\(path\)/)
    assert.match(src, /if \(other === null\) return null/)
  })
})

describe('公開ページは要求を読まない(静的のまま)', () => {
  it('_public・(site)・en の下で next/headers と cookies() を使わない', () => {
    const files = [...sourceFiles(join(APP, '_public')), ...sourceFiles(join(APP, '(site)')), ...sourceFiles(join(APP, 'en'))]
    assert.ok(files.length > 20, `走査したファイルが少なすぎる: ${files.length}`)
    for (const f of files) {
      const body = readFileSync(f, 'utf8')
      assert.doesNotMatch(body, /next\/headers|\bcookies\(\)|\bheaders\(\)|getLocale|next-intl\/server|_ui\/lang-switch|i18n\/actions/, f)
    }
  })
  it('en の layout は RootShell に lang="en" を渡す', () => {
    assert.match(read('en/layout.tsx'), /<RootShell lang="en">/)
    assert.match(read('(site)/layout.tsx'), /<RootShell lang="ja">/)
  })
})

describe('英語の頁の行き先は英語の頁を指す(R2)', () => {
  it('足の行き先は言語ごと(英語は /en の下)で、足は切り替えを持つ', () => {
    const footer = read('_public/site-footer.tsx')
    assert.match(footer, /en: \{ about: '\/en#about', terms: '\/en\/terms', privacy: '\/en\/privacy', news: '\/en\/news' \}/)
    assert.match(footer, /<LangLinks locale=\{locale\} path=\{paths\[page\]\} \/>/)
  })
  it('頭と戻る: 英語は /en', () => {
    assert.match(read('_public/site-header.tsx'), /locale === 'en' \? '\/en' : '\/'/)
    assert.match(read('_public/document-view.tsx'), /href: '\/en'/)
    assert.match(read('en/not-found.tsx'), /homeHref="\/en"/)
    assert.match(read('_shell/not-found-view.tsx'), /href=\{homeHref\}/)
  })
  it('足の切り替えは足のリンクの並び(<nav>)の最後の項目(案 B の画像・所有者の決定)', () => {
    const home = read('_public/home-view.tsx')
    const footer = home.slice(home.indexOf('<footer className="lp-foot'))
    assert.ok(footer.indexOf('<LangLinks') < footer.indexOf('</nav>'))
    assert.ok(footer.indexOf('</nav>') < footer.indexOf('lp-copy'))
    assert.match(footer, /<\/Link><LangLinks [^>]*\/><\/nav>/)
    const pub = read('_public/site-footer.tsx')
    assert.ok(pub.indexOf('<LangLinks') < pub.indexOf('</nav>'))
  })
  it('切り替えを出す頁は 8 頁だけ(/about・/coming-soon・/share には無い)', () => {
    for (const rel of ['(site)/about', '(site)/coming-soon', '(site)/share']) {
      for (const f of sourceFiles(join(APP, rel))) assert.doesNotMatch(readFileSync(f, 'utf8'), /LangLinks|qs-lsw/, f)
    }
  })
})

describe('公開ページの文(copy)', () => {
  it('日本語と英語は同じ形(キーと配列の長さ。段 1 の一文 lead だけは日本語が 3 行の組、英語は語の間で折れるので 1 つ)', () => {
    const withoutLead = (copy) => ({ ...copy, home: { ...copy.home, lead: undefined } })
    assert.deepEqual(shapeOf(withoutLead(en)), shapeOf(withoutLead(ja)))
    assert.equal(ja.home.lead.length, 3)
    assert.equal(en.home.lead.length, 1)
  })
  it('日本語の LP の文に、閉じていない折れの印が無い', () => {
    const pairs = [['⟦', '⟧'], ['⟨', '⟩'], ['⟪', '⟫'], ['⟮', '⟯']]
    const strings = []
    JSON.stringify(ja.home, (_k, v) => { if (typeof v === 'string') strings.push(v); return v })
    for (const text of strings) for (const [open, close] of pairs) assert.equal(text.split(open).length, text.split(close).length, text)
  })
  it('LP のログインと「はじめる」は言語を持たない /login を指す', () => {
    const home = read('_public/home-view.tsx')
    assert.equal((home.match(/href="\/login"/g) ?? []).length, 3)
  })
})

describe('App Store のバッジは表示の言語に合わせる', () => {
  it('home-view.tsx は en で英語のバッジ・ja で日本語のバッジを使う', () => {
    const home = read('_public/home-view.tsx')
    assert.match(home, /import appStoreBadgeEn from '@\/app\/_public\/lp\/app-store-badge-en\.svg'/)
    assert.match(home, /import appStoreBadgeJa from '@\/app\/_public\/lp\/app-store-badge-ja\.svg'/)
    assert.match(home, /locale === 'en' \? appStoreBadgeEn : appStoreBadgeJa/)
    assert.match(home, /<AppStoreBadge [^>]*locale=\{locale\}/)
  })
})
