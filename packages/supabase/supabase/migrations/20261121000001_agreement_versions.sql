-- consent-version: 同意した規約とポリシーのバージョン番号を、public.user_agreements の列に保管する。
--
-- 何を: 利用者が同意している規約の番号(agreed_terms_version)とポリシーの番号(agreed_privacy_version)と、
--   今の番号の組に最初に同意した日時(version_agreed_at)を、user_agreements の 3 列に持つ。
--   番号は文書ごとの通し番号(初版 = 1)で、最終改定日との対応は private.legal_revisions(改定の一覧)が正本。
--   決定の出どころ: 所有者 2026-09-22「テーブルにカラムを追加してそこで合意している規約のバージョンを保管する」
--   (07-24 の裁定: 二版目が生じた時点で additive migration で足す)。
-- 番号の決め方: 番号は DB が決める。呼ぶ側は番号も日時も渡さない(record_agreement は引数なし)。
--   今の番号 = 文書ごとに effective_at <= now() の最大の version。先の改定は、適用の前は記録されない。
-- 登録の前のログイン: user_agreements の行は登録(complete_onboarding)で初めてできる。登録の前のログインの番号は、
--   private.pending_registrations(同意前の行)の同じ 3 列に記録し、登録で user_agreements へそのまま写る
--   (承認済みのポリシーの掲示「登録の手続が完了する前のログインでも記録します」を保つ)。
--   record_agreement はどちらの表にも行を作らない(作ると、退会・中止・毎時の削除の後に同意前の行がよみがえり、
--   24 時間後に pending_claim が拾って Firebase のアカウントを消しに行く)。行を作るのは complete_onboarding だけ。
--   そのため削除の 3 関数(pending_confirm・finish_withdrawal・withdrawal_confirm)は置き換えず、advisory lock も要らない
--   (記録は既存の行の UPDATE だけで、同じ行の UPDATE と DELETE は行のロックで直列になる)。
-- 既存の行(user_agreements・pending_registrations)は埋め戻さない(null のまま)。後から番号を書くと、無かった証跡を作る。
--   判定は null を「どの番号より前」と扱う。
-- complete_onboarding の置き換え: 本体は 20261016000003 の写し + 番号を決める塊と insert の 4 列だけ。
--   公開済みの iOS 1.0.1 と今の web は、今の形(p_username)のまま通る。
-- 未公開の旧 2 本(20261117000001_agreed_versions・20261117000002_agreement_current。別の表 private.agreed_versions の形)は、
--   この 1 本に置き換えた(main には無く、本番にも当たっていない)。手元の DB は supabase db reset で作り直す。

-- =============================
-- 1. 改定の一覧(private・RLS 有効・policy なし・grant なし)
-- =============================
create table private.legal_revisions (
  doc text not null check (doc in ('terms', 'privacy')),
  version integer not null check (version >= 1),
  revised_on date not null,
  effective_at timestamptz not null,
  notice boolean not null,
  primary key (doc, version)
);
alter table private.legal_revisions enable row level security;
revoke all on table private.legal_revisions from public, anon, authenticated, service_role;

insert into private.legal_revisions (doc, version, revised_on, effective_at, notice) values
  ('terms',   1, date '2026-11-05', timestamptz '2026-11-05 00:00:00+09', false),
  ('privacy', 1, date '2026-11-05', timestamptz '2026-11-05 00:00:00+09', false),
  ('privacy', 2, date '2026-11-20', timestamptz '2026-11-20 00:00:00+09', true),
  ('privacy', 3, date '2026-11-22', timestamptz '2026-11-22 00:00:00+09', true);

-- =============================
-- 2. user_agreements に列を足す(additive・既存の行は null のまま)
-- =============================
alter table public.user_agreements
  add column agreed_terms_version integer,
  add column agreed_privacy_version integer,
  add column version_agreed_at timestamptz,
  add constraint user_agreements_versions_all_or_none check (
    (agreed_terms_version is null and agreed_privacy_version is null and version_agreed_at is null)
    or (agreed_terms_version is not null and agreed_privacy_version is not null and version_agreed_at is not null
        and agreed_terms_version >= 1 and agreed_privacy_version >= 1)
  );

alter table private.pending_registrations
  add column agreed_terms_version integer,
  add column agreed_privacy_version integer,
  add column version_agreed_at timestamptz,
  add constraint pending_registrations_versions_all_or_none check (
    (agreed_terms_version is null and agreed_privacy_version is null and version_agreed_at is null)
    or (agreed_terms_version is not null and agreed_privacy_version is not null and version_agreed_at is not null
        and agreed_terms_version >= 1 and agreed_privacy_version >= 1)
  );

-- =============================
-- 3. 登録の完了(元の本体 + ログインの時刻に適用されていた番号を入れる)
-- =============================
create or replace function public.complete_onboarding(p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub text;
  v_pending private.pending_registrations;
  v_login_at timestamptz;
  v_terms integer;
  v_privacy integer;
  v_agreed_at timestamptz;
begin
  -- 多層防御:EXECUTE は authenticated のみに付与するが、関数内でも有効なログインを検証する。
  if not private.session_ok() then
    raise exception 'not authenticated';
  end if;
  v_sub := auth.jwt() ->> 'sub';

  -- 長さのサニティ(DB CHECK char_length(username) between 1 and 15 の鏡像)。
  -- 文字種は検証しない(使用可能文字はアプリ層 Zod で寛容に定める。ここで二重化しない)。
  if p_username is null
     or char_length(p_username) < 1
     or char_length(p_username) > 15 then
    raise exception 'invalid username';
  end if;

  -- 同意前の行を for update で取る。毎時の削除の関数の取得(印を付ける update)と直列化され、
  -- 印が付いた後の完了は必ず拒否される。
  select * into v_pending
    from private.pending_registrations p
   where p.sub = v_sub
     for update;
  if not found then
    raise exception 'no pending registration';
  end if;
  if v_pending.claimed_at is not null then
    raise exception 'pending registration is being removed';
  end if;

  -- profiles と user_agreements を同一関数本体で INSERT(= 単一トランザクション)。
  -- agreed_at / preferred_language は渡さない(DB default が唯一の真実源)。
  insert into public.profiles (id, username)
  values (v_sub, p_username);

  -- 同意前の行に番号が在れば(登録の前のログインの記録)、3 列をそのまま写す。無ければ、ログインの時刻に適用されていた番号。
  if v_pending.agreed_terms_version is not null then
    v_terms := v_pending.agreed_terms_version;
    v_privacy := v_pending.agreed_privacy_version;
    v_agreed_at := v_pending.version_agreed_at;
  else
    v_login_at := pg_catalog.to_timestamp((auth.jwt() ->> 'auth_time')::bigint);
    select pg_catalog.max(r.version) into v_terms
      from private.legal_revisions r where r.doc = 'terms' and r.effective_at <= v_login_at;
    select pg_catalog.max(r.version) into v_privacy
      from private.legal_revisions r where r.doc = 'privacy' and r.effective_at <= v_login_at;
    if v_terms is null or v_privacy is null then
      v_terms := null;
      v_privacy := null;
      v_agreed_at := null;
    else
      v_agreed_at := v_login_at;
    end if;
  end if;

  insert into public.user_agreements (user_id, agreed_terms_version, agreed_privacy_version, version_agreed_at)
  values (v_sub, v_terms, v_privacy, v_agreed_at);

  delete from private.pending_registrations where sub = v_sub;
end;
$$;

-- =============================
-- 4. 同意の記録(ログインの画面・改定のお知らせ)
-- =============================
create function public.record_agreement()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub text;
  v_terms integer;
  v_privacy integer;
  v_row public.user_agreements;
  v_pending private.pending_registrations;
begin
  if not private.session_ok() then
    raise exception 'not authenticated';
  end if;
  v_sub := auth.jwt() ->> 'sub';

  select pg_catalog.max(r.version) into v_terms
    from private.legal_revisions r where r.doc = 'terms' and r.effective_at <= now();
  select pg_catalog.max(r.version) into v_privacy
    from private.legal_revisions r where r.doc = 'privacy' and r.effective_at <= now();
  if v_terms is null or v_privacy is null then
    raise exception 'no revision in effect';
  end if;

  select * into v_row from public.user_agreements a where a.user_id = v_sub for update;
  if found then
    if coalesce(v_row.agreed_terms_version, 0) >= v_terms
       and coalesce(v_row.agreed_privacy_version, 0) >= v_privacy then
      return 'already';
    end if;
    update public.user_agreements a
       set agreed_terms_version = v_terms,
           agreed_privacy_version = v_privacy,
           version_agreed_at = now()
     where a.user_id = v_sub;
    return 'recorded';
  end if;

  -- 登録の前: 同意前の行に書く。行が無い・削除中の印が在る時は、どちらの表にも行を作らない。
  select * into v_pending from private.pending_registrations p where p.sub = v_sub for update;
  if not found or v_pending.claimed_at is not null then
    return 'unregistered';
  end if;
  if coalesce(v_pending.agreed_terms_version, 0) >= v_terms
     and coalesce(v_pending.agreed_privacy_version, 0) >= v_privacy then
    return 'already';
  end if;
  update private.pending_registrations p
     set agreed_terms_version = v_terms,
         agreed_privacy_version = v_privacy,
         version_agreed_at = now()
   where p.sub = v_sub;
  return 'recorded';
end;
$$;
revoke all on function public.record_agreement() from public, anon, authenticated, service_role;
grant execute on function public.record_agreement() to authenticated;

-- =============================
-- 5. 今のバージョンへの同意の判定
-- =============================
create function public.current_agreement()
returns table (agreed boolean, notice_due boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub text;
  v_terms integer;
  v_privacy integer;
  v_row public.user_agreements;
  v_pending private.pending_registrations;
begin
  if not private.session_ok() then
    raise exception 'not authenticated';
  end if;
  v_sub := auth.jwt() ->> 'sub';

  select pg_catalog.max(r.version) into v_terms
    from private.legal_revisions r where r.doc = 'terms' and r.effective_at <= now();
  select pg_catalog.max(r.version) into v_privacy
    from private.legal_revisions r where r.doc = 'privacy' and r.effective_at <= now();

  select * into v_row from public.user_agreements a where a.user_id = v_sub;
  if found then
    agreed := v_terms is not null and v_privacy is not null
      and coalesce(v_row.agreed_terms_version, 0) >= v_terms
      and coalesce(v_row.agreed_privacy_version, 0) >= v_privacy;
    notice_due := exists (
      select 1 from private.legal_revisions r
       where r.effective_at <= now()
         and r.notice
         and r.version > coalesce(
               case r.doc when 'terms' then v_row.agreed_terms_version else v_row.agreed_privacy_version end, 0)
    );
    return next;
    return;
  end if;

  -- 登録の前: 同意前の行の番号で agreed を決める。お知らせは出さない(登録の画面の上に出さない)。
  select * into v_pending from private.pending_registrations p where p.sub = v_sub;
  agreed := found
    and v_terms is not null and v_privacy is not null
    and coalesce(v_pending.agreed_terms_version, 0) >= v_terms
    and coalesce(v_pending.agreed_privacy_version, 0) >= v_privacy;
  notice_due := false;
  return next;
end;
$$;
revoke all on function public.current_agreement() from public, anon, authenticated, service_role;
grant execute on function public.current_agreement() to authenticated;


-- =============================
-- 6. コメント
-- =============================
comment on table private.legal_revisions is '規約・ポリシーの改定の一覧(番号と最終改定日・適用の日時・お知らせの要否の対応の正本)。画面は読まない(権限なし)。改定のたびに新しい migration で 1 行足す。packages/shared/constants/legal-versions.ts の LEGAL_REVISIONS が写しで、照合のテストが一致を見る';
comment on column private.legal_revisions.doc is '文書。terms(利用規約)か privacy(プライバシーポリシー)';
comment on column private.legal_revisions.version is '文書ごとの通し番号。初版 = 1。改定のたびにその文書の番号を 1 つ足す';
comment on column private.legal_revisions.revised_on is '頁の最終改定日(docs/legal/*.md・packages/shared/constants/legal.ts の revisedOn)';
comment on column private.legal_revisions.effective_at is '適用の日時。今の番号は effective_at <= now() の最大の version。先の改定は、この日時の前は記録されない';
comment on column private.legal_revisions.notice is 'この改定で、既に登録した人に改定のお知らせを出すか';

comment on column public.user_agreements.agreed_terms_version is '同意している利用規約の番号(private.legal_revisions.version)。record_agreement か complete_onboarding が DB の中で決める。既存の行は null(どの番号より前として扱う)';
comment on column public.user_agreements.agreed_privacy_version is '同意しているプライバシーポリシーの番号(private.legal_revisions.version)。既存の行は null';
comment on column public.user_agreements.version_agreed_at is '今入っている番号の組に最初に同意した日時。登録の前のログインで同意した行は、その時の日時が写る。agreed_at(登録の時の同意の日時)とは別。3 列は全て null か全て非 null';

comment on column private.pending_registrations.agreed_terms_version is '登録の前のログインで記録した利用規約の番号。登録(complete_onboarding)で user_agreements へ写り、行ごと消える。既存の行は null';
comment on column private.pending_registrations.agreed_privacy_version is '登録の前のログインで記録したプライバシーポリシーの番号。登録で user_agreements へ写る。既存の行は null';
comment on column private.pending_registrations.version_agreed_at is '登録の前のログインで、今入っている番号の組に最初に同意した日時。登録で user_agreements へ写る';

comment on function public.record_agreement() is
  'ログインの画面・改定のお知らせでの同意を、今の番号(private.legal_revisions の effective_at <= now() の最大)で記録する。引数なし。user_agreements の本人の行が在ればそこへ、無ければ同意前の行(claimed_at が null)へ書く。戻り: recorded(書いた)・already(今の番号以上が入っていた)・unregistered(どちらの行も無い・削除中の印)。どちらの表にも行は作らない。有効なログインでなければ not authenticated。EXECUTE は authenticated のみ';
comment on function public.current_agreement() is
  '今の番号に同意しているか(agreed)と、お知らせを出すか(notice_due = 本人の番号より大きい notice の改定が適用済みで在る)を必ず 1 行で返す。user_agreements の行が無く同意前の行が在る時は、その番号で agreed を決め、notice_due は常に false。どちらの行も無ければ両方 false。本人の行だけを見る。有効なログインでなければ not authenticated。EXECUTE は authenticated のみ';
comment on function public.complete_onboarding(text) is
  '新規ユーザーの Onboarding 完了時に profiles + user_agreements を単一トランザクションで INSERT し、同意前の行を消す唯一の経路。書込対象は JWT の sub に固定され他者の行は作れない。同意前の行が無い・削除中の印がある sub は拒否する。agreed_at / preferred_language は渡さず DB default(now() / ja)が真実源。同意した番号は、同意前の行に在ればその 3 列をそのまま写し、無ければ(iOS 1.0.1・記録の失敗)トークンの auth_time に適用されていた番号と auth_time の日時を入れる(now() の番号にしない)。EXECUTE は authenticated のみ';

notify pgrst, 'reload schema';
