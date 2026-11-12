/**
 * 出典のタイトル(og:title)を取りに行かないホスト(spec §11.2「Instagram の URL はタイトルを取りに行かない」・harema#139 受入条件 7)。
 * Instagram は利用規約 4.2 と robots.txt(名指しの無い UA に Disallow: /)が自動の取得を禁じる。
 * 所有者の決定 2026-11-12(harema#122)。Meta の許可が出たら、この一覧から外して戻す。
 * 判定は止める方向だけ。node の組み込みに頼らない純粋関数(検査から直接読む)。
 */
const NO_FETCH_HOSTS = ['instagram.com']

/** `URL.hostname` を受ける。大文字と末尾の `.` を畳み、名前そのものか、その下の名前のときだけ真。 */
export function isNoFetchHost(hostname: string): boolean {
  let end = hostname.length
  while (end > 0 && hostname.charAt(end - 1) === '.') end -= 1
  const host = hostname.slice(0, end).toLowerCase()
  return NO_FETCH_HOSTS.some((name) => host === name || host.endsWith(`.${name}`))
}
