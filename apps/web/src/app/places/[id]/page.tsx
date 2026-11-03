import { notFound, redirect } from 'next/navigation'
import { savedPlaceIdSchema } from '@harema/shared/validations'
import { createUserSupabase, getVerifiedUser } from '@/lib/auth/session'
import { PlaceDetailScreen } from './place-detail-screen'

type PlaceDetailPageProps = {
  /** Next 16 の動的セグメントは Promise。await してから分割代入する。 */
  params: Promise<{ id: string }>
}

/**
 * 店舗詳細(④)のガードと 1 行取得(Server Component)。saved/page.tsx・map/page.tsx の鏡像で
 * ガードし(getVerifiedUser() で認証・spec §11.1-4 / profiles 未作成 → /onboarding)、URL の
 * `saved_places.id` を共有スキーマで検証してから当該 1 行を取る。
 *
 * URL に載るのは内部 uuid だけで `google_place_id` は出さない(裁定 2026-08-24)。
 * 形式違反の uuid・実在しない uuid・**他人の行**の uuid は、いずれも `notFound()` で
 * 製品 404 面(root の not-found.tsx・spec §5)へ落ちる。
 *
 * 本 WP は読み取りのみ。places / saved_places への書込はここでは一切しない。Supabase
 * クライアントはリクエストハンドラ内で生成し(module scope 禁止・spec §11.1-5)、認可は
 * getVerifiedUser() の検証済みサーバ identity だけで行う —— 検証を経ない cookie の中身を認可に
 * 使わない(spec §11.1-4)。
 *
 * 画面の描画(即時表示の Client・展開パネル・外部リンク)は WP-10 の後続スライスで足す。
 * このファイルが持つのは認証 → profiles → uuid 検証 → 1 行 select → 404 までである。
 */
export default async function PlaceDetailPage({ params }: PlaceDetailPageProps) {
  const { id } = await params

  const user = await getVerifiedUser()
  if (!user) {
    redirect('/login')
  }
  const supabase = await createUserSupabase()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    redirect('/onboarding')
  }

  // 形式違反の uuid は DB へ問い合わせずにここで 404 へ落とす。`z.uuid()` を `z.guid()` へ
  // 緩めない(緩めると uuid でない guid 形が DB まで届く)。
  const requestedId = savedPlaceIdSchema.safeParse(id)
  if (!requestedId.success) {
    notFound()
  }

  // user_id の明示フィルタは書かない —— own-only RLS が境界を担保する(saved/page.tsx と
  // 同じ前例)。他人の行はここで 0 行になり、実在しない行と同じ 404 に落ちる。
  // 座標は 29 日を超えると DB が null にする(店の行は残る)。null でも詳細は出し、location を null にする。
  // lat/lng は S1(保存/編集シート)の起動コンテキストに渡すためだけに読む値で、DB へは
  // 書き戻さない(A3 の編集導線が消費する。§8.1)。cached_at も 30 日リフレッシュも読まない
  // (/map の担当)。
  const { data: row, error } = await supabase
    .from('saved_places')
    .select(
      'id, status, memo, source_text, source_title, places(google_place_id, latitude, longitude)',
    )
    .eq('id', requestedId.data)
    .maybeSingle()
  // 取得失敗を「存在しない店」に化けさせない。error boundary に拾わせる。
  if (error) {
    throw error
  }
  // join が防御で落ちた行は詳細として描けない。一覧が同じ形の行を落とすのと揃える
  // (saved/page.tsx の flatMap)。
  if (!row || !row.places) {
    notFound()
  }

  // Client へ渡すのはこのスライスの描画が要る値だけ(saved_places.id は渡さない)。
  // lat/lng は S1 起動コンテキスト(MapLaunchContext)用に select 済みで、「編集する」が
  // 開く編集シートへ渡すためだけにここで消費する(DB へは書き戻さない)。
  return (
    <PlaceDetailScreen
      data={{
        status: row.status,
        memo: row.memo,
        sourceText: row.source_text,
        sourceTitle: row.source_title,
        googlePlaceId: row.places.google_place_id,
        location:
          row.places.latitude !== null && row.places.longitude !== null
            ? { lat: row.places.latitude, lng: row.places.longitude }
            : null,
      }}
    />
  )
}
