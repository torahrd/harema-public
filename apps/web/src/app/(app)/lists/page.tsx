import { redirect } from 'next/navigation'
import { createUserSupabase, getVerifiedUser } from '@/lib/auth/session'
import { readAgreementState } from '@/lib/auth/consent-notice'
import { parseListParam } from '@/lib/lists/list-filter-url'
import { readListsWithMembers } from '@/lib/lists/list-read'
import { withPlaceCounts } from '@/lib/lists/list-selection'
import { ListsScreen } from '@/app/lists/lists-screen'

type ListsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * 「リスト」の画面(web だけ・Server Component)。リストを作る・名前とアイコンを変える・消す所。
 * (app)/saved/page.tsx の鏡像でガードする: `getVerifiedUser()`(無ければ /login)→ profiles(無ければ /onboarding)→
 * 同意の判定(`agreement_state()` の `lists_open`。偽と読みの失敗は /map へ送り、リストを読まない)→ リストと所属の読み 1 回。
 * 店の数は、その所属から数える(読みは足さない・saved_places は読まない)。client は要求ごとに作り、module scope に置かない。
 * `user_id` の条件は書かず RLS に任せる(3 つの page の先例)。admin client は使わない。
 * `?list=<id>` は地図で絞っていたリスト。画面は戻るに引き継ぐだけ(uuid の形の時だけ通す。自分のリストの id かは画面が確かめる)。
 * 単位 lists-screen(所有者の決定 2026-11-25 20:21 JST・harema#152 のコメント 7160942619)。
 */
export default async function ListsPage({ searchParams }: ListsPageProps) {
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

  // 同意していない人には画面を出さず、同意の取り直しを出す地図へ送る。失敗は閉じる側。
  const { listsOpen } = await readAgreementState(supabase)
  if (!listsOpen) {
    redirect('/map')
  }

  const params = await searchParams
  const rawList = params.list
  const carriedListId = parseListParam(typeof rawList === 'string' ? rawList : null)

  const { lists, membership } = await readListsWithMembers(supabase)

  return <ListsScreen lists={withPlaceCounts(lists, membership)} carriedListId={carriedListId} />
}
