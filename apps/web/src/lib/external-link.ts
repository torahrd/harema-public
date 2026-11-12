/**
 * 外部のリンク(出典の URL)を開いてよいかの判定。純粋(import を持たない)。
 * mobile の `apps/mobile/src/place/external-link.ts` と同じ本体(mobile の検査が照らす)。
 */

/** http(s) の値かどうか(C-S11。安全でないスキームをリンク化しない)。 */
export function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

/** 出典 chip を押して開く URL。出典の欄の今の文字(前後の空白を除く)が http(s) のときだけ返し、ほかは null。 */
export function sourceChipUrl(sourceText: string): string | null {
  const url = sourceText.trim()
  return isHttpUrl(url) ? url : null
}

/** 出典の URL を枠に出すときの文字。先頭の `https://` / `http://` を除く(表示だけ。開くのは元の文字)。ほかはそのまま返す。 */
export function sourceLinkLabel(url: string): string {
  if (url.startsWith('https://')) return url.slice('https://'.length)
  if (url.startsWith('http://')) return url.slice('http://'.length)
  return url
}
