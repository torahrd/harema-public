import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const clean = (s) => s.replaceAll('**', '').replaceAll('`', '').replace(/\s+/g, ' ').trim()
const fail = (message) => { throw new Error(message) }

// 言語ごとの印。日本語の md は「最終改定日」と「## 第 N 条(見出し)」、英語の md は「Last revised」と「## Article N (Heading)」。
// 日付は英語も YYYY.MM.DD の形で書く(ISO の 2026-11-05 の形は「作業の日時」の規則に当たる)。
const LANGS = {
  ja: { revised: /^最終改定日 (\d{4}\.\d{2}\.\d{2})$/, header: /^## 第 (\d+) 条\((.+)\)$/, heading: (no, text) => `第 ${no} 条(${text})` },
  en: { revised: /^Last revised (\d{4}\.\d{2}\.\d{2})$/, header: /^## Article (\d+) \((.+)\)$/, heading: (no, text) => `Article ${no} (${text})` },
}

// 公開本文(1 本目と 2 本目の `---` の間)と題名に出てはいけない、管理記録・計画の側の語。
// 同じファイルの冒頭の注記と末尾の管理記録には書いてよい。URL の中は見ない(公式文書の docs/ などで誤って落ちないため)。
// 各行は [名前, 正規表現, 必ず当たる例]。--self-test が例で全行を確かめ、SAFE_SENTENCES で当たらないことを確かめる。
const INTERNAL_TERMS = [
  ['管理記録', /管理記録|棚卸し表/, '(管理記録 B の U19)'],
  ['所有者の決定', /所有者の(?:決定|指示|判断|承認|確認|答え|発言)/, '所有者の決定で外した'],
  ['論点の番号(U<数字>)', /(?<![A-Za-z0-9])U\d+(?![A-Za-z0-9])/, 'U19 のとおり'],
  ['事実・所見の番号(F<数字>・F-<数字>・P<数字>)', /(?<![A-Za-z0-9])(?:F-?\d+|P\d+)(?![A-Za-z0-9])/, 'F-4 の指摘'],
  ['計画の記録(PLAN・FACTS・REVIEW・DISPOSITION・QUESTIONS)', /(?<![A-Za-z])(?:PLAN|FACTS|REVIEW|DISPOSITION|QUESTIONS)(?![a-z])/, 'PLAN §4.1'],
  ['repo のパス(docs/・apps/・packages/・.md・.tsv)', /(?:docs|apps|packages)\/|\.(?:md|tsv)(?![A-Za-z0-9])/, 'CHANGES.tsv に記載'],
  ['Issue・PR の番号', /#\d/, 'harema#38 で外した'],
  ['commit とその hash', /\bcommits?\b|コミット|(?<![0-9A-Za-z])(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}(?![0-9A-Za-z])/, 'main 66f969a の実装'],
  ['作業の日時(ISO の日付・JST の時刻)', /\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2} ?JST/, '2026-11-05 00:41 の決定'],
  ['作業の道具(Claude・Codex・ブランチ・作業記録・作業ツリー・共有フォルダ・比較画像)', /Claude|Codex|ブランチ|作業記録|作業ツリー|共有フォルダ|比較画像/, 'Claude の読み'],
  ['仮の差し込み(<…>)', /<[^>]*>/, '(<同意の記録>)'],
]
// 公開本文に正当に出うる文。どの行にも当たってはいけない。
const SAFE_SENTENCES = [
  '詳しくは https://firebase.google.com/docs/auth と https://play.google.com/store/apps/details?id=app.harema をご覧ください。',
  '詳細は https://example.com/p/3fa8c91e と https://example.com/guide.md を参照してください。',
  '端末の所有者または権利の所有者は、運営者に申し出ることができます。',
  '日本標準時(JST)で 2026.11.05 から適用します。運営者の commitment として守ります。',
  '第 12 条 2 項・第 7 条 1 項の表の 1〜4 号に従います。',
]
// URL の直後に続く本文の語は、URL と一緒に消さずに捕まえる。
const URL_ADJACENT = ['https://example.com/guideの管理記録を参照してください。', 'https://example.com/guide)(PLAN §4.1)']
// URL の境目は画面の描画(linkify-core.ts の splitLinks)と同じにする。URL の直後の日本語は本文として見る。
let splitLinks
const stripUrls = (line) => splitLinks(line).map((part) => part.kind === 'url' ? ' ' : part.value).join('')

export function findInternalTerms(lines, offset = 0) {
  const hits = []
  lines.forEach((line, i) => {
    const text = stripUrls(line)
    for (const [name, pattern] of INTERNAL_TERMS) {
      const match = text.match(pattern)
      if (match) hits.push(`${offset + i + 1} 行目: ${name}: …${text.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20)}…`)
    }
  })
  return hits
}

export function parseLegal(source, lang = 'ja') {
  const marks = LANGS[lang] ?? fail(`unknown language: ${lang}`)
  if (/【要確認】|TODO|YYYY\.MM\.DD/.test(source)) fail('placeholder')
  const lines = source.split(/\r?\n/)
  const dividers = lines.flatMap((line, i) => line === '---' ? [i] : [])
  if (dividers.length < 2) fail('missing public body boundary')
  const title = lines[0].replace(/^# /, '')
  const revisedOn = lines.map((line) => line.match(marks.revised)?.[1]).find(Boolean)
  if (!title || !revisedOn) fail('title or revision missing')
  const document = { title, revisedOn, preamble: [], articles: [] }
  let article, paragraph, item
  const body = lines.slice(dividers[0] + 1, dividers[1])
  const internal = [...findInternalTerms([lines[0]], 0), ...findInternalTerms(body, dividers[0] + 1)]
  if (internal.length) fail(`internal terms in public body:\n${internal.join('\n')}`)
  for (let i = 0; i < body.length; i++) {
    const line = body[i]
    if (!line.trim()) continue
    // 折れの印(U+200B)は前文(第 1 条より前)の描き方だけが読む。条の本文では画面に字として出るので置かない。
    // 英語の本文は前文にも置かない(英語は語の間で折れるので、折れの印を使わない)。条の見出しの行も条の本文として扱う。
    const header = line.match(marks.header)
    if ((article || header || lang === 'en') && line.includes('\u200B')) fail(`zero-width break mark in ${article || header ? 'article' : 'public'} body: ${line}`)
    if (header) {
      article = { no: Number(header[1]), heading: clean(header[2]), paragraphs: [] }
      document.articles.push(article)
      paragraph = item = undefined
      continue
    }
    if (/^#{1,6} |<[^>]+>|!\[|\[\^/.test(line)) fail(`unsupported markdown: ${line}`)
    const indent = line.match(/^ */)[0].length
    if (![0, 3, 6].includes(indent)) fail(`unsupported indent ${indent}: ${line}`)
    const value = line.slice(indent)
    const numbered = value.match(/^(\d+)\. (.+)$/)
    const group = indent === 0 && value.match(/^\*\*\((\d+)\) (.+)\*\*$/)
    if (indent === 0 && numbered) {
      if (!article) fail('paragraph without article')
      paragraph = { no: Number(numbered[1]), sentences: [clean(numbered[2])], items: [], blocks: [] }
      article.paragraphs.push(paragraph)
      item = undefined
      continue
    }
    if (group) {
      if (!article) fail('group without article')
      paragraph = { heading: `(${group[1]}) ${clean(group[2])}`, sentences: [], items: [], blocks: [] }
      article.paragraphs.push(paragraph)
      item = undefined
      continue
    }
    if (indent === 3 && numbered) {
      if (!paragraph?.no || paragraph.blocks.length) fail('item without numbered paragraph or after blocks')
      item = { no: Number(numbered[1]), sentences: [clean(numbered[2])], blocks: [] }
      paragraph.items.push(item)
      continue
    }
    let target
    if (indent === 0) {
      if (!article) { document.preamble.push(clean(value)); continue }
      if (!paragraph?.heading) {
        paragraph = { sentences: [], items: [], blocks: [] }
        article.paragraphs.push(paragraph)
      }
      target = paragraph
      item = undefined
    } else if (indent === 3) {
      if (!paragraph?.no) fail('indented block without numbered paragraph')
      target = paragraph
    } else {
      if (!item) fail('deep block without item')
      target = item
    }
    if (value.startsWith('|')) {
      const rows = []
      while (i < body.length && body[i].startsWith(' '.repeat(indent) + '|')) {
        const cells = body[i].trim().slice(1, -1).split('|').map(clean)
        if (!cells.every((cell) => /^[-:]+$/.test(cell))) rows.push(cells)
        i++
      }
      i--
      if (rows.length < 2 || rows.some((row) => row.length !== rows[0].length)) fail('invalid table')
      target.blocks.push({ kind: 'table', header: rows[0], rows: rows.slice(1) })
    } else if (value.startsWith('- ')) {
      const items = []
      while (i < body.length && body[i].startsWith(' '.repeat(indent) + '- ')) {
        const raw = body[i].slice(indent + 2)
        const label = raw.match(/^\*\*(.+?)\*\*(?: —— (.+))?$/)
        items.push({ label: label ? clean(label[1]) : undefined, sentences: [clean(label ? (label[2] ?? '') : raw)] })
        i++
      }
      i--
      target.blocks.push({ kind: 'list', items })
    } else if (value.startsWith('> ')) {
      target.blocks.push({ kind: 'note', sentences: [clean(value.slice(2))] })
    } else if (target === paragraph && !paragraph.no && !paragraph.heading && indent === 0) {
      paragraph.sentences.push(clean(value))
    } else {
      target.blocks.push({ kind: 'paragraph', sentences: [clean(value)] })
    }
  }
  return document
}

function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

// --self-test の壊し方。壊す場所は文言でなく構造(本文の領域の中で最初に当たる行の型)から選ぶ。
// 本文の領域 = 1 本目と 2 本目の `---` の間。管理記録(2 本目の後)は壊す場所に使わない。
function negativeControls(source, lang = 'ja') {
  const lines = source.split(/\r?\n/)
  const dividers = lines.flatMap((line, i) => line === '---' ? [i] : [])
  if (dividers.length < 2) fail('negative controls: missing public body boundary')
  const inBody = (i) => i > dividers[0] && i < dividers[1]
  const isTableRow = (line) => /^ *\|.*\|\s*$/.test(line)
  const pick = (name, test) => {
    const index = lines.findIndex((line, i) => inBody(i) && test(line, i))
    if (index < 0) fail(`negative controls: no ${name} line in the public body`)
    return index
  }
  const edit = (index, replace) => (s) => { const out = s.split(/\r?\n/); out[index] = replace(out[index]); return out.join('\n') }
  const sentence = pick('numbered paragraph sentence', (line) => /^\d+\. \S/.test(line))
  const cell = pick('table cell', (line) => isTableRow(line) && !line.trim().slice(1, -1).split('|').every((c) => /^[-:\s]+$/.test(c)))
  const tableStart = pick('table start', (line, i) => isTableRow(line) && !isTableRow(lines[i - 1] ?? ''))
  const note = pick('note', (line) => /^ *> /.test(line))
  const heading = pick('article heading', (line) => /^## (第 \d+ 条\(|Article \d+ \()/.test(line))
  const preamble = pick('preamble line', (line, i) => line.trim() && !line.startsWith('#') && !line.startsWith('>') && i < heading)
  return [
    { name: 'sentence-changed', apply: edit(sentence, (line) => `${line}(陰性対照)`) },
    { name: 'table-cell-changed', apply: edit(cell, (line) => line.replace(/^( *\|)[^|]*\|/, '$1 陰性対照 |')) },
    { name: 'table-indent-shifted', apply: edit(tableStart, (line) => `   ${line}`) },
    { name: 'note-indent-invalid', apply: edit(note, (line) => ` ${line}`) },
    ...(lang === 'en' ? [{ name: 'break-mark-in-english-preamble', expect: 'zero-width break mark in public body', apply: edit(preamble, (line) => `${line.slice(0, 4)}\u200B${line.slice(4)}`) }] : []),
    { name: 'break-mark-in-first-heading', expect: 'zero-width break mark', apply: edit(heading, (line) => line.replace('(', '(\u200B')) },
    { name: 'break-mark-in-article', expect: 'zero-width break mark', apply: edit(sentence, (line) => `${line.slice(0, 4)}\u200B${line.slice(4)}`) },
    { name: 'internal-term-in-body', expect: 'internal terms', apply: edit(sentence, (line) => `${line}(管理記録 B の U19)`) },
    { name: 'plan-note-in-body', expect: 'internal terms', apply: edit(note, (line) => `${line}(PLAN.md §4.1・2026-11-05 00:41 JST)`) },
  ]
}
function expectedRows(doc, lang = 'ja') {
  const rows = []
  const add = (path, type = '*', value = '') => rows.push(`${path}\t${type}\t${value}`)
  const blocks = (list, root) => list.forEach((block, index) => {
    const path = `${root}/b${index + 1}`
    add(path, block.kind === 'list' ? 'UL' : block.kind === 'table' ? 'TABLE' : '*')
    if (block.kind === 'list') block.items.forEach((entry, n) => add(`${path}/l${n + 1}`, 'LI<UL', clean([entry.label, ...entry.sentences].filter(Boolean).join(' —— '))))
    else if (block.kind === 'table') [block.header, ...block.rows].forEach((row, n) => row.forEach((cell, c) => add(`${path}/r${n}c${c + 1}`, n === 0 ? 'TH<TR' : 'TD<TR', cell)))
    else block.sentences.forEach((sentence, n) => add(`${path}/t${n + 1}`, '*', sentence))
  })
  doc.preamble.forEach((line, index) => { add(`pre${index + 1}`); add(`pre${index + 1}/t`, '*', line) })
  doc.articles.forEach((article) => {
    const a = `a${article.no}`
    add(a); add(`${a}/h`, '*', LANGS[lang].heading(article.no, article.heading))
    article.paragraphs.forEach((paragraph, index) => {
      const p = `${a}/p${index + 1}`
      add(p, paragraph.no ? 'LI<OL' : '*')
      if (paragraph.heading) add(`${p}/h`, '*', paragraph.heading)
      paragraph.sentences.forEach((sentence, n) => add(`${p}/t${n + 1}`, '*', sentence))
      paragraph.items.forEach((item, j) => {
        const path = `${p}/i${j + 1}`
        add(path, 'LI<OL')
        item.sentences.forEach((sentence, n) => add(`${path}/t${n + 1}`, '*', sentence))
        blocks(item.blocks, path)
      })
      blocks(paragraph.blocks, p)
    })
  })
  return rows.join('\n') + '\n'
}

const args = process.argv.slice(2)
const webDir = fileURLToPath(new URL('../', import.meta.url))
const legalDir = args.includes('--legal-dir') ? args[args.indexOf('--legal-dir') + 1] : resolve(webDir, '../../docs/legal')
const names = ['terms', 'privacy']
const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'ja'
if (!(lang in LANGS)) fail(`unknown language: ${lang}`)
;({ splitLinks } = await import(pathToFileURL(resolve(webDir, 'src/app/_public/linkify-core.ts')).href))
// 英語の md は日本語の md の隣の en/ に置く。--lang で出す言語を選ぶ(--emit-expected のとき)。
const dirOf = (l) => l === 'en' ? resolve(legalDir, 'en') : legalDir
const parsedBy = Object.fromEntries(Object.keys(LANGS).map((l) => [l, Object.fromEntries(names.map((name) => [name, parseLegal(readFileSync(resolve(dirOf(l), `${name}.md`), 'utf8'), l)]))]))
const parsed = parsedBy[lang]
// 掲示の間の本文(docs/legal/posting/)。docs/legal の本文は効力発生の後の本文で、効力発生の日時になるまで /privacy には posting の本文が出る
// (切り替えは apps/web/src/app/_public/legal-switch.ts がサーバの時刻で行う)。
const postingOf = (l) => parseLegal(readFileSync(resolve(l === 'en' ? resolve(legalDir, 'posting', 'en') : resolve(legalDir, 'posting'), 'privacy.md'), 'utf8'), l)
const posting = { ja: postingOf('ja'), en: postingOf('en') }
const hrefs = (doc, l = 'ja') => expectedRows(doc, l).split('\n').flatMap((row) => splitLinks(row.split('\t')[2] ?? '').filter((part) => part.kind === 'url').map((part) => part.value))

// 英語の参考訳が、日本語の正本と同じ組み(条の数・番号・項・号・表・箇条)で、約束した書き方をしているか。
const shapeOf = (doc) => doc.articles.map((a) => ({
  no: a.no,
  paragraphs: a.paragraphs.map((p) => ({
    no: p.no ?? null,
    heading: Boolean(p.heading),
    sentences: p.sentences.length,
    items: p.items.map((i) => ({ no: i.no, sentences: i.sentences.length, blocks: i.blocks.map(blockShape) })),
    blocks: p.blocks.map(blockShape),
  })),
}))
const blockShape = (b) => b.kind === 'table' ? `table ${b.header.length}x${b.rows.length + 1}` : b.kind === 'list' ? `list ${b.items.length}` : b.kind
const ENGLISH_TITLES = { terms: 'Terms of Use', privacy: 'Privacy Policy' }
const textLeaves = (doc) => expectedRows(doc, 'en').split('\n').filter(Boolean).map((row) => row.split('\t')[2] ?? '')
export function checkEnglish(name, en, ja, split = splitLinks) {
  const problems = []
  if (en.title !== ENGLISH_TITLES[name]) problems.push(`title: ${en.title} (expected ${ENGLISH_TITLES[name]})`)
  if (en.revisedOn !== ja.revisedOn) problems.push(`Last revised ${en.revisedOn} differs from the Japanese revision date ${ja.revisedOn}`)
  if (!en.preamble[0]?.includes('the Japanese version prevails')) problems.push('the first line of the body must say the Japanese version prevails')
  if (!equal(shapeOf(en), shapeOf(ja))) {
    const a = shapeOf(en), b = shapeOf(ja)
    const at = Math.max(a.length, b.length) > 0 ? [...Array(Math.max(a.length, b.length)).keys()].find((i) => !equal(a[i], b[i])) : undefined
    problems.push(`structure differs from the Japanese version (articles ${a.length} vs ${b.length}; first difference at article index ${at})`)
  }
  const leaves = textLeaves(en)
  if (leaves.some((leaf) => /service account/i.test(leaf))) problems.push('the phrase "service account" must not appear')
  for (const leaf of leaves) {
    for (const part of split(leaf)) {
      if (part.kind !== 'url') continue
      if (/[.,;:]$/.test(part.value)) problems.push(`URL ends with a punctuation mark (the page would link it): ${part.value}`)
      if (/^https:\/\/harema\.app\/(?:terms|privacy)(?![A-Za-z0-9-])/.test(part.value)) problems.push(`link to the Japanese page (use /en/…): ${part.value}`)
    }
  }
  return problems
}
if (args.includes('--self-test')) {
  let controlCount = 0
  for (const l of Object.keys(LANGS)) {
    const original = readFileSync(resolve(dirOf(l), 'privacy.md'), 'utf8')
    const controls = negativeControls(original, l)
    for (const change of controls) {
      let detected = false
      try {
        const changed = parseLegal(change.apply(original), l)
        detected = !change.expect && !equal(changed, parsedBy[l].privacy)
      } catch (error) { detected = !change.expect || error.message.startsWith(change.expect) }
      if (!detected) fail(`negative case undetected (${l}): ${change.name}`)
    }
    controlCount += controls.length
  }
  // 英語の検査の陰性対照: 約束した形から外した物を、それぞれ止める。
  for (const name of names) {
    const ok = checkEnglish(name, parsedBy.en[name], parsedBy.ja[name])
    if (ok.length) fail(`english check: baseline fails: ${ok.join(' / ')}`)
  }
  const postingBaseline = checkEnglish('privacy', posting.en, posting.ja)
  if (postingBaseline.length) fail(`english check (posting): baseline fails: ${postingBaseline.join(' / ')}`)
  const en = parsedBy.en, ja = parsedBy.ja
  const mutate = (doc, change) => { const copy = structuredClone(doc); change(copy); return copy }
  const englishControls = [
    ['title', 'terms', (d) => { d.title = 'Terms of Service' }],
    ['revised-date', 'privacy', (d) => { d.revisedOn = '2026.11.05' === ja.privacy.revisedOn ? '2026.11.06' : '2026.11.05' }],
    ['missing-article', 'terms', (d) => { d.articles.pop() }],
    ['missing-paragraph', 'privacy', (d) => { d.articles[0].paragraphs.pop() }],
    ['not-translation-notice', 'privacy', (d) => { d.preamble[0] = 'Welcome.' }],
    ['url-trailing-period', 'terms', (d) => { d.articles[0].paragraphs[0].sentences[0] += ' https://x.com/htoranosuke.' }],
    ['link-to-japanese-page', 'terms', (d) => { d.articles[0].paragraphs[0].sentences[0] += ' (https://harema.app/privacy)' }],
    ['service-account', 'privacy', (d) => { d.articles[0].paragraphs[0].sentences[0] += ' A service account is used.' }],
  ]
  for (const [label, name, change] of englishControls) {
    if (!checkEnglish(name, mutate(en[name], change), ja[name]).length) fail(`english check: negative case undetected: ${label}`)
  }
  for (const [name, , example] of INTERNAL_TERMS) if (!findInternalTerms([example]).some((hit) => hit.startsWith(`1 行目: ${name}:`))) fail(`internal terms: rule undetected: ${name}`)
  for (const sentence of URL_ADJACENT) if (!findInternalTerms([sentence]).length) fail(`internal terms: undetected after a URL: ${sentence}`)
  for (const sentence of SAFE_SENTENCES) { const hits = findInternalTerms([sentence]); if (hits.length) fail(`internal terms: false positive: ${hits.join(' / ')}`) }
  const original = readFileSync(resolve(legalDir, 'privacy.md'), 'utf8')
  try { parseLegal(`${original}\n管理記録 U99・PLAN.md・commit abc1234・2026-11-05 00:41 JST\n`); } catch { fail('internal terms: a term after the second divider must not fail') }
  if (!splitLinks('(https://policies.google.com/terms)および').some((part) => part.kind === 'url' && part.value === 'https://policies.google.com/terms')) fail('URL terminator')
  console.log(`self-test: PASS (${controlCount + englishControls.length} negative cases・${INTERNAL_TERMS.length} internal-term rules・${SAFE_SENTENCES.length} safe sentences・${URL_ADJACENT.length} after-URL cases)`)
} else if (args.includes('--generate')) {
  const gen = (l, name) => JSON.stringify(parsedBy[l][name], null, 2)
  writeFileSync(resolve(webDir, 'src/app/_public/legal.ts'), `// Generated from the frozen public bodies. Verify with check:legal.\nexport type Block = { kind: 'note' | 'paragraph'; sentences: string[] } | { kind: 'list'; items: { label?: string; sentences: string[] }[] } | { kind: 'table'; header: string[]; rows: string[][] }\nexport type Item = { no: number; sentences: string[]; blocks: Block[] }\nexport type Paragraph = { no?: number; heading?: string; sentences: string[]; items: Item[]; blocks: Block[] }\nexport type Article = { no: number; heading: string; paragraphs: Paragraph[] }\nexport type LegalDocument = { title: string; revisedOn: string; preamble: string[]; articles: Article[] }\nexport const terms: LegalDocument = ${gen('ja', 'terms')}\nexport const privacy: LegalDocument = ${gen('ja', 'privacy')}\n// English reference translations (docs/legal/en). The Japanese version prevails.\nexport const termsEn: LegalDocument = ${gen('en', 'terms')}\nexport const privacyEn: LegalDocument = ${gen('en', 'privacy')}\n// Bodies shown while the notice of revision is posted (docs/legal/posting). Switched to the bodies above at the effective time by legal-switch.ts.\nexport const privacyPosting: LegalDocument = ${JSON.stringify(posting.ja, null, 2)}\nexport const privacyPostingEn: LegalDocument = ${JSON.stringify(posting.en, null, 2)}\n`)
} else if (args.includes('--emit-expected')) {
  const name = args[args.indexOf('--emit-expected') + 1]
  if (!names.includes(name)) fail('unknown document')
  process.stdout.write(expectedRows(parsed[name], lang))
} else {
  const live = await import(pathToFileURL(resolve(webDir, 'src/app/_public/legal.ts')).href)
  const liveKey = (l, name) => l === 'en' ? `${name}En` : name
  for (const l of Object.keys(LANGS)) for (const name of names) if (!equal(parsedBy[l][name], live[liveKey(l, name)])) fail(`${l}/${name}: legal body differs`)
  if (!equal(posting.ja, live.privacyPosting)) fail('ja/privacyPosting: legal body differs')
  if (!equal(posting.en, live.privacyPostingEn)) fail('en/privacyPosting: legal body differs')
  const problems = [
    ...names.flatMap((name) => checkEnglish(name, parsedBy.en[name], parsedBy.ja[name]).map((problem) => `en/${name}: ${problem}`)),
    ...checkEnglish('privacy', posting.en, posting.ja).map((problem) => `en/posting/privacy: ${problem}`),
  ]
  if (problems.length) fail(`english translation checks:\n${problems.join('\n')}`)
  console.log('差分 0・規則外 0・placeholder 0・英訳の照合 0')
  for (const l of Object.keys(LANGS)) console.log(`${l}/posting/privacy hrefs (${hrefs(posting[l], l).length}): ${hrefs(posting[l], l).join(' | ')}`)
  for (const l of Object.keys(LANGS)) for (const name of names) console.log(`${l}/${name} hrefs (${hrefs(parsedBy[l][name], l).length}): ${hrefs(parsedBy[l][name], l).join(' | ')}`)
}
