import type { CSSProperties } from 'react'

// Quiet Signal の字の段(tokens.json の Scale と Japanese text)。値は spec §9。
export const LABEL_JA: CSSProperties = { fontFamily: 'var(--ff-sans)', fontWeight: 700, fontSize: 11, lineHeight: '16px', letterSpacing: '0.05em', color: 'var(--fg-3)' }
export const LABEL_EN: CSSProperties = { ...LABEL_JA, letterSpacing: '0.1125em', textTransform: 'uppercase' }
export const META: CSSProperties = { fontFamily: 'var(--ff-sans)', fontSize: 13, lineHeight: '20px', letterSpacing: '0.02em' }
export const BODY: CSSProperties = { fontFamily: 'var(--ff-sans)', fontSize: 16, lineHeight: 1.7, letterSpacing: '0.02em' }
export const NUM: CSSProperties = { fontFamily: 'var(--ff-mono)', fontVariantNumeric: 'tabular-nums', letterSpacing: 0 }
export function heading(size: 18 | 20 | 24 | 32): CSSProperties {
  return { fontFamily: 'var(--ff-heading-jp)', fontWeight: 700, fontSize: size, lineHeight: size >= 20 ? 1.5 : 1.6, letterSpacing: '0.01em', fontFeatureSettings: '"palt"' }
}
