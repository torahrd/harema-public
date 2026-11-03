import 'server-only'

import { createHmac } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@harema/supabase/types'

/**
 * 出典 OGP 取得の抑制。判定そのものは DB(claim_ogp_fetch / complete_ogp_fetch)が持つ ——
 * サーバレスではインスタンスが使い捨てられ複数同時に立つので、プロセス内メモリは
 * 抑制の共有状態にならない。ここが持つのは「URL を鍵に変える」ことと、判定の呼び分けだけ。
 */

/**
 * dedup の鍵。URL 平文は DB へ渡さない —— 抑制に要るのは同一性だけで、出典の URL は
 * 保存されたときだけ saved_places.source_text に載る、という境界を崩さないため。
 *
 * 素の SHA-256 ではなく **その利用者の uid を鍵にした HMAC** にする。出典に使われる URL の
 * 空間は狭く、素のダイジェストは既製の対応表 1 枚で全利用者ぶんが一度に元に戻る。
 * ただし uid は台帳の同じ行に載っているので、これで復元不能になるわけではない ——
 * 効果と限界の全文はマイグレーション 20260806000001 の冒頭にある。
 */
function urlKey(userId: string, url: string): string {
  return createHmac('sha256', userId).update(url, 'utf8').digest('hex')
}

export type OgpFetchClaim =
  /** 外向き取得を始めてよい。終わったら必ず completeOgpFetch を呼んで lease を解放する。 */
  | { allowed: true; key: string }
  /** 抑制。同一 URL の取得済みタイトルがあるときだけ cachedTitle が非空。 */
  | { allowed: false; cachedTitle: string }

/**
 * 取得の許可を取る。DB に問えなかった場合は許可しない —— 抑制の台帳が書けない状態で
 * 外向き接続を出すと、抑制が無いのと同じになる(fail-closed)。
 *
 * userId は鍵にしか使わない。台帳の行を選ぶのは DB 側の auth.uid() なので、ここに
 * 渡す値は呼び出し元の getVerifiedUser() 由来でなければならない。
 */
export async function claimOgpFetch(
  supabase: SupabaseClient<Database>,
  userId: string,
  url: string,
): Promise<OgpFetchClaim> {
  const key = urlKey(userId, url)

  const { data, error } = await supabase
    .rpc('claim_ogp_fetch', { p_url_hash: key })
    .single()
  if (error) {
    return { allowed: false, cachedTitle: '' }
  }

  if (!data.allowed) {
    return { allowed: false, cachedTitle: data.cached_title }
  }
  return { allowed: true, key }
}

/**
 * 取得の終了を記録する。**取れなかった場合も呼ぶ** —— lease を解放し、失敗も窓の間だけ
 * キャッシュして同じ URL への再挑戦を外へ出さないため。記録できたかどうかを返す。
 */
export async function completeOgpFetch(
  supabase: SupabaseClient<Database>,
  key: string,
  title: string | null,
): Promise<boolean> {
  const { error } = await supabase.rpc('complete_ogp_fetch', {
    p_url_hash: key,
    // 生成型の p_title は非 null。空文字は DB 側で NULL に畳まれる(取得できなかった、の記録)。
    p_title: title ?? '',
  })
  return error === null
}
