/**
 * Google の帰属表示(spec §4.4)。地図を伴わずに Places のデータを出す画面はロゴを含める
 * 必要があり、一覧での置き場所は**リストの末尾**で確定している(PM 決定 2026-08-06)。
 *
 * アセットは Google 公式配布の 2 枚(白背景用 / 濃色背景用)をそのまま置いてある ——
 * 自作・改変・再着色は商標上できない。light / dark の出し分けは `<picture>` の media で行い、
 * 共有 CSS に手を入れない。原寸は 240×28(2 倍密度)で、表示は 120×14。
 */
export function GoogleAttribution() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}>
      <picture>
        <source
          media="(prefers-color-scheme: dark)"
          srcSet="/powered-by-google-on-non-white.png"
        />
        <img
          src="/powered-by-google-on-white.png"
          alt="Powered by Google"
          width={120}
          height={14}
          style={{ display: 'block', width: 120, height: 14 }}
        />
      </picture>
    </div>
  )
}
