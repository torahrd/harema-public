import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const clean = (s) => s.replaceAll('**', '').replaceAll('`', '').replace(/\s+/g, ' ').trim()
const fail = (message) => { throw new Error(message) }

export function parseLegal(source) {
  if (/【要確認】|TODO|YYYY\.MM\.DD/.test(source)) fail('placeholder')
  const lines = source.split(/\r?\n/)
  const dividers = lines.flatMap((line, i) => line === '---' ? [i] : [])
  if (dividers.length < 2) fail('missing public body boundary')
  const title = lines[0].replace(/^# /, '')
  const revisedOn = lines.find((line) => /^最終改定日 \d{4}\.\d{2}\.\d{2}$/.test(line))?.slice(6)
  if (!title || !revisedOn) fail('title or revision missing')
  const document = { title, revisedOn, preamble: [], articles: [] }
  let article, paragraph, item
  const body = lines.slice(dividers[0] + 1, dividers[1])
  for (let i = 0; i < body.length; i++) {
    const line = body[i]
    if (!line.trim()) continue
    const header = line.match(/^## 第 (\d+) 条\((.+)\)$/)
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
function negativeControls(source) {
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
  return [
    { name: 'sentence-changed', apply: edit(sentence, (line) => `${line}(陰性対照)`) },
    { name: 'table-cell-changed', apply: edit(cell, (line) => line.replace(/^( *\|)[^|]*\|/, '$1 陰性対照 |')) },
    { name: 'table-indent-shifted', apply: edit(tableStart, (line) => `   ${line}`) },
    { name: 'note-indent-invalid', apply: edit(note, (line) => ` ${line}`) },
  ]
}
function expectedRows(doc) {
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
    add(a); add(`${a}/h`, '*', `第 ${article.no} 条(${article.heading})`)
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
const parsed = Object.fromEntries(names.map((name) => [name, parseLegal(readFileSync(resolve(legalDir, `${name}.md`), 'utf8'))]))
const { splitLinks } = await import(pathToFileURL(resolve(webDir, 'src/app/_public/linkify-core.ts')).href)
const hrefs = (doc) => expectedRows(doc).split('\n').flatMap((row) => splitLinks(row.split('\t')[2] ?? '').filter((part) => part.kind === 'url').map((part) => part.value))
if (args.includes('--self-test')) {
  const original = readFileSync(resolve(legalDir, 'privacy.md'), 'utf8')
  const controls = negativeControls(original)
  for (const change of controls) {
    let detected = false
    try { detected = !equal(parseLegal(change.apply(original)), parsed.privacy) } catch { detected = true }
    if (!detected) fail(`negative case undetected: ${change.name}`)
  }
  if (!splitLinks('(https://policies.google.com/terms)および').some((part) => part.kind === 'url' && part.value === 'https://policies.google.com/terms')) fail('URL terminator')
  console.log(`self-test: PASS (${controls.length + 1} negative cases)`)
} else if (args.includes('--generate')) {
  writeFileSync(resolve(webDir, 'src/app/_public/legal.ts'), `// Generated from the frozen public bodies. Verify with check:legal.\nexport type Block = { kind: 'note' | 'paragraph'; sentences: string[] } | { kind: 'list'; items: { label?: string; sentences: string[] }[] } | { kind: 'table'; header: string[]; rows: string[][] }\nexport type Item = { no: number; sentences: string[]; blocks: Block[] }\nexport type Paragraph = { no?: number; heading?: string; sentences: string[]; items: Item[]; blocks: Block[] }\nexport type Article = { no: number; heading: string; paragraphs: Paragraph[] }\nexport type LegalDocument = { title: string; revisedOn: string; preamble: string[]; articles: Article[] }\nexport const terms: LegalDocument = ${JSON.stringify(parsed.terms, null, 2)}\nexport const privacy: LegalDocument = ${JSON.stringify(parsed.privacy, null, 2)}\n`)
} else if (args.includes('--emit-expected')) {
  const name = args[args.indexOf('--emit-expected') + 1]
  if (!names.includes(name)) fail('unknown document')
  process.stdout.write(expectedRows(parsed[name]))
} else {
  const live = await import(pathToFileURL(resolve(webDir, 'src/app/_public/legal.ts')).href)
  for (const name of names) if (!equal(parsed[name], live[name])) fail(`${name}: legal body differs`)
  console.log('差分 0・規則外 0・placeholder 0')
  for (const name of names) console.log(`${name} hrefs (${hrefs(parsed[name]).length}): ${hrefs(parsed[name]).join(' | ')}`)
}
