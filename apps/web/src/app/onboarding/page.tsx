import { redirect } from 'next/navigation'
import { createUserSupabase, getVerifiedUser } from '@/lib/auth/session'
import { OnboardingForm } from './onboarding-form'

/**
 * Onboarding 画面のガード(Server Component)。ログイン直後の新規ユーザー(同意前)は
 * /map がここへ送る。getVerifiedUser()(spec §11.1-4・署名と期限を検証した ID トークンの sub と DB の判定)で認証を確認し、未認証は /login、
 * profiles 済みは /map、認証済・未登録のみ暫定フォームを描画する。
 *
 * M1(背景ぼかしモーダル)/ M2(規約フルモーダル)の視覚仕上げは design 出力待ちで未実装。
 * 現状は username 入力 + 完了 + 中止だけの暫定フォームを置く(登録・中止・二重登録ガードの検証用)。
 */
export default async function OnboardingPage() {
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
  if (profile) {
    redirect('/map')
  }

  return <OnboardingForm />
}
