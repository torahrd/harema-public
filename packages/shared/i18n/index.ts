import { ja } from './ja'

export { ja }

/** メッセージ辞書の型構造。将来ロケールを足すときの契約(全ロケールが ja と同型)。 */
export type Messages = typeof ja
