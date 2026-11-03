/**
 * 失敗の表示(login-replace の FREEZE: compare-v3 の ③ 退会・④ ログアウト・⑤ 登録の中止の「新」)。
 * 印の × + 1〜2 文(1 文ごとに 1 行)。`role="alert"` なので、出た時点で読み上げられる(出ていない間は描かない)。
 * 色・字体は Quiet Signal(globals.css 7.・× は印の vermilion・文は ink)。面の根の `.qs` の中で使う。
 */
export function ActionError({
  lines,
  className,
}: {
  lines: readonly [string] | readonly [string, string]
  className?: string
}) {
  return (
    <div role="alert" className={className ? `auth-err ${className}` : 'auth-err'} data-auth-error>
      <svg className="x" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2" fill="none" />
      </svg>
      <p className="tx">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
    </div>
  )
}
