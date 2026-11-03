/**
 * ブラウザのツールバー色(所見 ②)。`<meta content>` は `var()` を解決しないので、
 * ここだけは spec §9 の背景 hex(Light = paper / Dark = ink)を直に持つ。
 * 読むのは `layout.tsx` の viewport のみ —— iOS 26 系はこの meta を見ないので、
 * そちらの追従は `.edge-tint`(globals.css)が `--bg` で受け持つ。
 */
export const THEME_COLOR = {
  light: '#FFFFFF',
  dark: '#171918',
} as const
