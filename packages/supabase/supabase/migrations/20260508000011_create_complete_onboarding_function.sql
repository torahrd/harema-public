-- =============================
-- Onboarding 完了の原子的書込(SECURITY DEFINER)
-- =============================
-- 新規ユーザーの Onboarding 完了時、profiles と user_agreements を単一トランザクション
-- (= 単一関数本体)で INSERT する。どちらか片方が失敗すれば関数呼び出し全体がロールバックし、
-- 部分コミットしない。呼び出し元 Server Action はサーバセッション getUser() で認証を確認し、
-- profiles 既存チェックの上で本関数を呼ぶ。書込対象は auth.uid() 由来の id に固定され、
-- クライアント供給値では他者の行を作れない(handle_new_user トリガーは作らない・契約 §1#6)。
create or replace function public.complete_onboarding(p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 多層防御:EXECUTE は authenticated のみに付与するが、関数内でも認証を検証する。
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- 長さのサニティ(DB CHECK char_length(username) between 1 and 15 の鏡像)。
  -- 文字種は検証しない(使用可能文字はアプリ層 Zod で寛容に定める。ここで二重化しない)。
  if p_username is null
     or char_length(p_username) < 1
     or char_length(p_username) > 15 then
    raise exception 'invalid username';
  end if;

  -- profiles と user_agreements を同一関数本体で INSERT(= 単一トランザクション)。
  -- どちらかが失敗すれば呼び出し全体がロールバックする(部分コミットしない)。
  -- agreed_at / preferred_language は渡さない(DB default が唯一の真実源)。
  insert into public.profiles (id, username)
  values (auth.uid(), p_username);

  insert into public.user_agreements (user_id)
  values (auth.uid());
end;
$$;

comment on function public.complete_onboarding is
  '新規ユーザーの Onboarding 完了時に profiles + user_agreements を単一トランザクションで INSERT する唯一の経路。SECURITY DEFINER で RLS を迂回するが、書込対象は auth.uid() 由来の id に固定され他者の行は作れない。agreed_at / preferred_language は渡さず DB default(now() / ja)が真実源。片方の失敗で両行がロールバックし部分コミットしない。EXECUTE は authenticated のみ';

-- =============================
-- EXECUTE 最小化(PUBLIC 既定を除去し、authenticated のみに付与)
-- =============================
revoke execute on function public.complete_onboarding(text) from public;
grant execute on function public.complete_onboarding(text) to authenticated;
