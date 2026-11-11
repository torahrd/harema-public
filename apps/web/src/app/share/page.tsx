import { ShareReceiver } from './share-receiver'

// Web Share Target の受け口(manifest の share_target.action)。cookie・認証・searchParams を読まない。
// 届いた値の処理は client の ShareReceiver が行う(文字は出さない)。
export default function SharePage() {
  return <ShareReceiver />
}
