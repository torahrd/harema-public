'use server'

import type { SavedPlaceStatus } from '@harema/shared/constants'
import {
  googlePlaceIdSchema,
  savePlaceInputSchema,
  sourceUrlSchema,
  type SavePlaceInput,
} from '@harema/shared/validations'
import { revalidatePath } from 'next/cache'
import { redirect, RedirectType } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@harema/supabase/types'
import { createUserSupabase, getVerifiedUser } from '@/lib/auth/session'
import { fetchOgTitle } from '@/lib/ogp/fetch-og-title'
import { claimOgpFetch, completeOgpFetch } from '@/lib/ogp/fetch-throttle'
import { fetchPlaceLocation } from '@/lib/places/details'
import { upsertVerifiedPlace } from '@/lib/supabase/admin'

/**
 * S1(保存/編集シート)のサーバ側。4 つの action はいずれもリクエストハンドラ内で Supabase
 * クライアントを生成し(module scope 禁止・spec §11.1-5)、認可は getVerifiedUser()(署名・iss・aud・期限を検証した
 * ID トークンの sub と DB の判定)のみで行う(§11.1-4)。共有 places への書込だけは検証済み座標を用途限定の admin 関数へ渡す。
 * 保存済み店舗の読取・書込・削除はユーザースコープのクライアントと own-only RLS を使う。
 */

/**
 * 未評価の初期状態。ここへ**戻す**遷移だけが不可(spec §6.2・§8)。DB CHECK には置かず
 * アプリ層で拒否する —— UI の disabled は DevTools で外れるので、権威はこの action にある。
 */
const UNRATED_STATUS: SavedPlaceStatus = 'want_to_go'

export type ResolveSavedPlaceResult =
  | { ok: true; mode: 'create' }
  | {
      ok: true
      mode: 'edit'
      status: SavedPlaceStatus
      memo: string
      sourceText: string
      sourceTitle: string
    }
  | { ok: false; reason: 'invalid_input' | 'unauthenticated' | 'failed' }

export type FetchSourceTitleResult =
  | { ok: true; title: string }
  | { ok: false; reason: 'not_a_url' | 'unauthenticated' | 'unavailable' }

export type SavePlaceResult =
  | { ok: true; mode: 'created' | 'updated' }
  | {
      ok: false
      reason:
        | 'invalid_input'
        | 'unauthenticated'
        | 'place_not_found'
        | 'status_reverted'
        | 'conflict'
        | 'failed'
    }

/**
 * 削除の結果。**識別子を 1 つも返さない** —— 呼び出し元が次の操作のために持ち回れる値を
 * 作らないため(往復させた識別子で行を特定しない・§9-F2)。
 */
export type DeleteSavedPlaceResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_input' | 'unauthenticated' | 'failed' }

/** places の内部 id。行が無いこと(null)は失敗ではない。 */
type PlaceIdLookup = { ok: true; placeId: string | null } | { ok: false }

/**
 * google_place_id から places の内部 id を引く。**このモジュールで places を読む口はここ 1 つ**
 * ——解決を各 action へ散らすと、削除の対象行がどの識別子で決まるのかを 1 箇所で読めなくなる。
 * export しない(Server Action の口を増やさない)。
 *
 * 誰も保存していない店は places にも行が無いので、null は正常な結果として返す。DB エラーだけを
 * ok: false に畳む —— 呼び出し元でこの 2 つを取り違えると、失敗を「もう無い」と読んでしまう。
 */
async function findPlaceId(
  supabase: SupabaseClient<Database>,
  googlePlaceId: string,
): Promise<PlaceIdLookup> {
  const { data, error } = await supabase
    .from('places')
    .select('id')
    .eq('google_place_id', googlePlaceId)
    .maybeSingle()
  if (error) {
    return { ok: false }
  }
  return { ok: true, placeId: data?.id ?? null }
}

/**
 * シート起動時に「新規か編集か」を解決する。**必ずサーバに問う** —— 地図が持つ savedPlaces は
 * no_thanks を除外していて google_place_id も持たないため、クライアント側で判定すると
 * 「もういい」で保存済みの店を新規と誤判定し、UNIQUE(user_id, place_id) に当たる。
 * 参照するのは DB だけなので Google の課金は増えない。ユーザー境界は own-only RLS が担保する。
 */
export async function resolveSavedPlace(
  googlePlaceId: string,
): Promise<ResolveSavedPlaceResult> {
  const parsed = googlePlaceIdSchema.safeParse(googlePlaceId)
  if (!parsed.success) {
    return { ok: false, reason: 'invalid_input' }
  }

  const user = await getVerifiedUser()
  if (!user) {
    return { ok: false, reason: 'unauthenticated' }
  }
  const supabase = await createUserSupabase()

  const lookup = await findPlaceId(supabase, parsed.data)
  if (!lookup.ok) {
    return { ok: false, reason: 'failed' }
  }
  // 誰も保存していない店は places にも行が無い。
  if (lookup.placeId === null) {
    return { ok: true, mode: 'create' }
  }

  const { data: saved, error: savedError } = await supabase
    .from('saved_places')
    .select('status, memo, source_text, source_title')
    .eq('user_id', user.id)
    .eq('place_id', lookup.placeId)
    .maybeSingle()
  if (savedError) {
    return { ok: false, reason: 'failed' }
  }
  if (!saved) {
    return { ok: true, mode: 'create' }
  }

  // 入力欄はいずれも制御された文字列なので、DB の NULL は空欄として返す。
  return {
    ok: true,
    mode: 'edit',
    status: saved.status,
    memo: saved.memo ?? '',
    sourceText: saved.source_text ?? '',
    sourceTitle: saved.source_title ?? '',
  }
}

/**
 * 出典 URL の og:title を取りに行く。未認証は即失敗にする —— 認証を要さない外部フェッチの口を
 * 作らないため(踏み台化の防止)。URL として解釈できない自由記述は取りに行かず not_a_url を
 * 返し、呼び出し元はそのまま source_text として扱う(S-12 裁定)。
 *
 * 認証の後に**サーバ側の抑制**を通す(2026-08-06 裁定)。同時実行 1 本 / 同一 URL の再取得抑止 /
 * 単位時間あたりの回数上限の 3 つで、判定は DB が持つ(lib/ogp/fetch-throttle.ts)。クライアント側の
 * 抑制はこの action を直接叩く呼び出しに効かないので、権威をここへ置く。抑制に掛かったときは
 * 既存の失敗表示に畳む(新しい文言を作らない)—— 保存そのものは妨げない。
 */
export async function fetchSourceTitle(
  url: string,
): Promise<FetchSourceTitleResult> {
  const parsed = sourceUrlSchema.safeParse(url)
  if (!parsed.success) {
    return { ok: false, reason: 'not_a_url' }
  }

  const user = await getVerifiedUser()
  if (!user) {
    return { ok: false, reason: 'unauthenticated' }
  }
  const supabase = await createUserSupabase()

  // 鍵は uid で HMAC する(利用者を跨いだ対応表を無効化する)。uid は上の getVerifiedUser() 由来のみ。
  const claim = await claimOgpFetch(supabase, user.id, parsed.data)
  if (!claim.allowed) {
    // 同一 URL の取得済みタイトルがあるなら、外へ出ずにそれを返す —— 貼り直しのような通常操作を
    // 抑制で失敗にしないため。無い場合(回数上限・同時実行・取得できなかった URL)は失敗に畳む。
    return claim.cachedTitle.length > 0
      ? { ok: true, title: claim.cachedTitle }
      : { ok: false, reason: 'unavailable' }
  }

  const title = await fetchOgTitle(parsed.data)
  // 失敗も記録する:lease を解放し、同じ URL への再挑戦を窓の間だけ外へ出さない。
  const recorded = await completeOgpFetch(supabase, claim.key, title)
  if (!recorded || !title) {
    return { ok: false, reason: 'unavailable' }
  }
  return { ok: true, title }
}

/**
 * 保存 / 更新の本体。順序に意味がある ——
 *   1. サーバ側で入力を再検証(クライアントを信用しない・spec §8)
 *   2. getVerifiedUser() で認可(§11.1-4)。偽・判定不能なら以降(Place Details・admin 書込)へ進まない。user_id はここ由来のみで、クライアントからは受け取らない
 *   3. サーバ側 Place Details で実在検証 + lat/lng 取得。失敗したら places を書かない
 *   4. 検証済み座標を用途限定の admin 関数で places に書く(§11.1-8)
 *   5. 既存行の有無で INSERT / UPDATE を分け、逆戻り遷移をここで拒否する(§6.2・§8)
 */
export async function savePlace(
  input: SavePlaceInput,
): Promise<SavePlaceResult> {
  const parsed = savePlaceInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, reason: 'invalid_input' }
  }
  const { googlePlaceId, status, memo, sourceText, sourceTitle } = parsed.data

  const user = await getVerifiedUser()
  if (!user) {
    return { ok: false, reason: 'unauthenticated' }
  }
  const supabase = await createUserSupabase()

  // 実在しない place_id で places に行を作らせない。座標もここで取ったものに固定する。
  const resolved = await fetchPlaceLocation(googlePlaceId)
  if (!resolved) {
    return { ok: false, reason: 'place_not_found' }
  }

  let placeId: string
  try {
    placeId = await upsertVerifiedPlace(resolved)
  } catch {
    return { ok: false, reason: 'failed' }
  }

  const { data: existing, error: existingError } = await supabase
    .from('saved_places')
    .select('status')
    .eq('user_id', user.id)
    .eq('place_id', placeId)
    .maybeSingle()
  if (existingError) {
    return { ok: false, reason: 'failed' }
  }

  if (!existing) {
    const { error: insertError } = await supabase.from('saved_places').insert({
      user_id: user.id,
      place_id: placeId,
      status,
      memo,
      source_text: sourceText,
      source_title: sourceTitle,
    })
    if (insertError) {
      // UNIQUE(user_id, place_id) の競合(= 別タブ等で先に保存された)。行は作られていないので
      // 成功に畳まない。クライアントは編集モードで開き直す(S-13 裁定)。
      if (insertError.code === '23505') {
        return { ok: false, reason: 'conflict' }
      }
      return { ok: false, reason: 'failed' }
    }
    return { ok: true, mode: 'created' }
  }

  // 評価済み(want_to_go 以外)から「行きたい」へは戻せない。
  if (existing.status !== UNRATED_STATUS && status === UNRATED_STATUS) {
    return { ok: false, reason: 'status_reverted' }
  }

  const { error: updateError } = await supabase
    .from('saved_places')
    .update({
      status,
      memo,
      source_text: sourceText,
      source_title: sourceTitle,
    })
    .eq('user_id', user.id)
    .eq('place_id', placeId)
  if (updateError) {
    return { ok: false, reason: 'failed' }
  }
  return { ok: true, mode: 'updated' }
}

/**
 * 保存した店を 1 軒消す共通処理。**元に戻せない**ので、順序と入力の狭さがそのまま安全域になる ——
 *   1. 受け取るのは `googlePlaceId` の 1 本だけ。saved_places.id も place_id も**受け取らない**。
 *      サーバが返してクライアントが返送した値も「クライアント由来」であり、行の特定には使わない
 *      (§9-F2)。クライアントは既に検証済みでも、ここで shared のスキーマにかけ直す(spec §8)
 *   2. `user_id` は getVerifiedUser() が返す検証済みのサーバ側同一性からのみ得る(§11.1-4)。
 *      未検証のローカルセッションも、クライアントが名乗った uid も使わない
 *   3. places の内部 id はこのモジュール内で引き直す(findPlaceId)
 *   4. 削除は (user_id, place_id) の 2 条件で絞る。RLS の own-only は**もう 1 枚**の統制であって
 *      この絞りの代わりではない —— 片方が退行しても、もう片方が他人の行を守る
 *
 * クライアントは savePlace と同じくリクエストスコープの認証済みクライアントで、削除のために
 * 権限を上げることはしない。上げると全フィルタ検査が緑のまま RLS 側の統制だけが消える。
 *
 * export しない(§11.1-5 と同じ理由 —— 削除を起こす口をこのモジュール内に集約する)。
 * `deleteSavedPlace`(地図・従来経路)と `deleteSavedPlaceFromDetail`(詳細・AD-N1 是正)の
 * 両方がこれを共有し、削除の実装は 1 つしか無い。**`revalidatePath('/saved')` はこの関数の
 * 中の 1 箇所だけ、成功経路のみ、`redirect()` より前に呼ぶ**(WP-10-irregular-ad-n1-2026-08-26
 * §3.1。C-S16 / C-S6 は両 export で同一に成立する)。
 */
async function performDelete(
  googlePlaceId: string,
): Promise<DeleteSavedPlaceResult> {
  const parsed = googlePlaceIdSchema.safeParse(googlePlaceId)
  if (!parsed.success) {
    return { ok: false, reason: 'invalid_input' }
  }

  const user = await getVerifiedUser()
  if (!user) {
    return { ok: false, reason: 'unauthenticated' }
  }
  const supabase = await createUserSupabase()

  const lookup = await findPlaceId(supabase, parsed.data)
  if (!lookup.ok) {
    return { ok: false, reason: 'failed' }
  }

  // places に行が無い = その店を保存している行も在り得ない(place_id は places への FK)。
  // 消すものが既に無いだけなので失敗にしない —— 0 行 DELETE と同じ扱いにする(§9-F5)。
  if (lookup.placeId !== null) {
    const { error: deleteError } = await supabase
      .from('saved_places')
      .delete()
      .eq('user_id', user.id)
      .eq('place_id', lookup.placeId)
    if (deleteError) {
      return { ok: false, reason: 'failed' }
    }
  }

  // **成功したときだけ**一覧を作り直す。失敗経路でここへ来ない位置に置いてある ——
  // 消えていないのに一覧が「消えた」と読める面を作らないため。0 行 DELETE は DB エラーでは
  // ないので成功側で、作り直す(観測側の対は /saved の行と件数バッジ)。
  revalidatePath('/saved')
  return { ok: true }
}

/**
 * 地図画面からの削除(既存経路)。**成功しても遷移しない** —— 呼び出し元(map-screen.tsx)が
 * `onSaved('deleted')` を受けて `router.refresh()` する(地図に留まる)。export 署名と挙動は
 * AD-N1 是正で 1 ビットも変えない。
 */
export async function deleteSavedPlace(
  googlePlaceId: string,
): Promise<DeleteSavedPlaceResult> {
  return performDelete(googlePlaceId)
}

/**
 * 詳細画面からの削除(AD-N1 是正・WP-10-irregular-ad-n1-2026-08-26)。**成功したときだけ**
 * サーバ側 `redirect()` で `/saved` へ送る —— 削除された行自身の再描画
 * (`/places/[id]` の再取得が `notFound()` に落ちる)がクライアントの木を置き換え、
 * シートの退場コールバックが発火する前に遷移命令ごと消えてしまう事象(AD-N1)を、
 * その再描画が起こる前に遷移先をこの関数自身が確定させることで避ける。
 *
 * `redirect()` は正常な return ではなく専用の Error を throw する公式仕様
 * (`next/navigation`)。呼び出し元(`save-sheet.tsx` の `handleDeleteConfirm`)の
 * `try`/`catch` はこれを他の失敗と区別し、`unstable_rethrow` で握り潰さず伝播させる
 * 責務を持つ —— ここでは投げるところまでが責務。
 */
export async function deleteSavedPlaceFromDetail(
  googlePlaceId: string,
): Promise<DeleteSavedPlaceResult> {
  const result = await performDelete(googlePlaceId)
  if (!result.ok) {
    return result
  }
  redirect('/saved', RedirectType.replace)
}
