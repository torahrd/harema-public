// watchPosition の失敗のうち、現在地の表示を落とすべきもの(N-3)。
// 許可の取り消し(PERMISSION_DENIED = 1)だけが状態を 'denied' に落とす。一時的な測位の失敗
// (POSITION_UNAVAILABLE = 2・TIMEOUT = 3)は許可が残っているので、最後に取れた位置のドットを残し、
// watch を続ける(黙ってドットが消えるのを防ぐ)。
const PERMISSION_DENIED = 1

export function watchErrorRevokesLocation(code: number): boolean {
  return code === PERMISSION_DENIED
}
