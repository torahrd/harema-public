import type { ReactNode } from 'react'

type FullViewportShellProps = {
  children: ReactNode
}

/**
 * 版面いっぱいの固定シェル(fixed 配置・inset 全辺 0)。`/saved` と `/places/[id]` は
 * これまで同じ外殻(member for member 同一の style オブジェクト)を個別に持っていた
 * (2026-08-24 実測。`docs/_harness/records/pmo/WP-10-option-b-feasibility-2026-08-24.json`
 * route_d)。この共有化は**人間承認済みのファイルスコープ拡張 1 件**(同記録)——
 * `tools/device-check` の layout-viewport-ledger が数える版面いっぱいの固定要素の
 * 出現数を 4 のまま保つ。
 *
 * CSS は元の 2 箇所と byte 同一(プロパティの値・順序を変えていない)。
 */
export function FullViewportShell({ children }: FullViewportShellProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
      }}
    >
      {children}
    </div>
  )
}
