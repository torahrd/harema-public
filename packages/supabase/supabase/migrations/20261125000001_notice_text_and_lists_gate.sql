-- notice-text-and-lists-gate: 改定のお知らせの文を DB から返し、リストをポリシー 4 回目の改定に同意した人にだけ開く(25 本目)。
--
-- 何を:
--   1. private.legal_revisions に 3 列(builtin_text・notice_ja・notice_en)を足す。お知らせの文を、ビルドに持つ(builtin_text)改定と、
--      DB から返す改定に分ける。今の 4 行(ポリシー 2・3 を含む)は builtin_text = true(iOS 2.0.0 と今の本番の web がビルドに持つ文を出す改定)。
--      以後の行は既定の false で、notice の行は文(日本語・英語)を必ず持つ(CHECK)。
--   2. private.lists_ok()(リストを開いてよい本人か)と、public.lists・public.list_places の restrictive policy 2 本(門)。
--      真になるのは、本人の user_agreements の agreed_privacy_version が 4 以上で、legal_revisions に ('privacy', 4) の行が在り、
--      その effective_at <= now() のときだけ。行が無い・適用の前・user_agreements の行が無い(登録の前)は偽(fail-closed)。
--      公開済みの migration の permissive policy 7 本は変えない(restrictive は permissive と AND で合わさる)。
--   3. public.agreement_state()・public.agree_current()(新しいクライアント向けの 2 つ。文と lists_open を返す・今の番号を記録する)。
--   4. 旧い 2 関数(current_agreement・record_agreement。iOS 2.0.0 と今の本番の web が呼ぶ)を同じ名前と形で置き換える。
--      current_agreement の notice_due は builtin_text の改定だけを数える。record_agreement は、番号が「適用済み・notice・builtin_text」の
--      最大の番号より小さい人(user_agreements の行が在る人)には、その番号までしか書かない。
--      塞ぐ損: iOS 2.0.0 は 4 回目の文を持たないので、3 回目に同意していない人が「続ける」を押して 4 回目の同意が記録され、
--      web でリストがお知らせなしに開く。上限が null の文書(notice の行が無い terms)は上限を掛けず、今の番号を書く(今のまま)。
--   5. ポリシー 3 の行に、承認済みの文(今の辞書 consentNotice.body1・body2)を一字も変えずに入れる。日付は {date} と書き、
--      クライアントが notice_effective_on(effective_at の日本標準時の暦日)で埋める(日付の正本は effective_at の 1 か所)。
--      ポリシー 2 は null のまま(ポリシー 3 が適用済みで、選ばれない)。
-- 4 回目の改定の行はこの migration では足さない(文言の承認と日付の確定の後の別の migration)。行が無い間は lists_ok() は全員に偽で、
--   旧い 2 関数の戻りは今と同じ。
-- SECURITY DEFINER は search_path を固定し、public・anon・service_role の execute を revoke する(authenticated だけに grant)。
-- 公開済みの migration は書き換えない(新規 1 本)。

-- =============================
-- 1. 改定の一覧に文の列を足す
-- =============================
-- 既存の 4 行はビルドに文を持つ側(true)で入る。足した後で、以後の既定を false にする。
alter table private.legal_revisions
  add column builtin_text boolean not null default true,
  add column notice_ja text[],
  add column notice_en text[];
alter table private.legal_revisions alter column builtin_text set default false;
alter table private.legal_revisions
  add constraint legal_revisions_notice_text check (
    not notice or builtin_text or (notice_ja is not null and notice_en is not null)
  );

-- ポリシー 3(適用 2026-11-22 0 時 JST)のお知らせの文。承認済みの文を辞書から一字も変えずに写す({date} は適用の日で埋める)。
update private.legal_revisions
   set notice_ja = array[
         'プライバシーポリシーを、{date} に改定しました。',
         '言語を選べるようにするため、Cookie の説明を加え、同意の記録の説明を改めました。'
       ],
       notice_en = array[
         'We updated the Privacy Policy on {date}.',
         'To let you choose a language, we added an explanation of the language cookie and revised the explanation of the record of agreement.'
       ]
 where doc = 'privacy' and version = 3;

-- =============================
-- 2. リストの門(private.lists_ok と restrictive policy)
-- =============================
-- 引数なし・本人は JWT の sub から決める(呼ぶ側から ID を受けない)。stable は 1 文の中で now() が変わらないため。
create function private.lists_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_agreements a
     where a.user_id = (select auth.jwt() ->> 'sub')
       and coalesce(a.agreed_privacy_version, 0) >= 4
       and exists (
         select 1 from private.legal_revisions r
          where r.doc = 'privacy' and r.version = 4 and r.effective_at <= now()
       )
  )
$$;
revoke all on function private.lists_ok() from public, anon, authenticated, service_role;
grant execute on function private.lists_ok() to authenticated;

-- restrictive は既存の permissive(持ち主の policy 7 本)と AND で合わさる。画面・Server Action・mobile の REST のどれも、ここで止まる。
-- 退会・保存した店の削除が起こす外部キーの cascade は表の持ち主の権限で動き、policy を通らない。
-- 条件は他の policy と同じく session_ok を先に持つ(10_session_ok の「全ての policy の条件に session_ok」の契約)。
create policy "lists_gate" on public.lists as restrictive for all to authenticated
  using ((select private.session_ok()) and (select private.lists_ok()))
  with check ((select private.session_ok()) and (select private.lists_ok()));
create policy "list_places_gate" on public.list_places as restrictive for all to authenticated
  using ((select private.session_ok()) and (select private.lists_ok()))
  with check ((select private.session_ok()) and (select private.lists_ok()));

-- =============================
-- 3. 新しい 2 関数(agreement_state・agree_current)
-- =============================
-- 同意の状態と、お知らせの文と、リストが開いているかを必ず 1 行で返す。
--   agreed・notice_due の決め方は current_agreement() と同じ(builtin_text を問わず、全ての notice の改定を数える)。
--   文は、本人の番号より大きい適用済みの notice の改定のうち effective_at が最も後の 1 行の物(同じ時刻なら番号の大きい方)。
--   notice_effective_on はその行の effective_at の日本標準時の暦日(YYYY.MM.DD)。notice_due が偽なら 3 つとも null。
--   登録の前の人(同意前の行だけ)と、どちらの行も無い人は、notice_due・lists_open とも偽(agreed は current_agreement と同じ)。
create function public.agreement_state()
returns table (
  agreed boolean,
  notice_due boolean,
  notice_effective_on text,
  notice_ja text[],
  notice_en text[],
  lists_open boolean
)
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
  v_latest private.legal_revisions;
begin
  if not private.session_ok() then
    raise exception 'not authenticated';
  end if;
  v_sub := auth.jwt() ->> 'sub';

  select pg_catalog.max(r.version) into v_terms
    from private.legal_revisions r where r.doc = 'terms' and r.effective_at <= now();
  select pg_catalog.max(r.version) into v_privacy
    from private.legal_revisions r where r.doc = 'privacy' and r.effective_at <= now();

  notice_effective_on := null;
  notice_ja := null;
  notice_en := null;

  select * into v_row from public.user_agreements a where a.user_id = v_sub;
  if found then
    agreed := v_terms is not null and v_privacy is not null
      and coalesce(v_row.agreed_terms_version, 0) >= v_terms
      and coalesce(v_row.agreed_privacy_version, 0) >= v_privacy;
    select * into v_latest
      from private.legal_revisions r
     where r.effective_at <= now()
       and r.notice
       and r.version > coalesce(
             case r.doc when 'terms' then v_row.agreed_terms_version else v_row.agreed_privacy_version end, 0)
     order by r.effective_at desc, r.version desc
     limit 1;
    notice_due := found;
    if notice_due then
      notice_effective_on := pg_catalog.to_char(v_latest.effective_at at time zone 'Asia/Tokyo', 'YYYY.MM.DD');
      notice_ja := v_latest.notice_ja;
      notice_en := v_latest.notice_en;
    end if;
    lists_open := private.lists_ok();
    return next;
    return;
  end if;

  -- 登録の前: 同意前の行の番号で agreed を決める。お知らせも、リストも開かない。
  select * into v_pending from private.pending_registrations p where p.sub = v_sub;
  agreed := found
    and v_terms is not null and v_privacy is not null
    and coalesce(v_pending.agreed_terms_version, 0) >= v_terms
    and coalesce(v_pending.agreed_privacy_version, 0) >= v_privacy;
  notice_due := false;
  lists_open := false;
  return next;
end;
$$;
revoke all on function public.agreement_state() from public, anon, authenticated, service_role;
grant execute on function public.agreement_state() to authenticated;

-- 今の番号に同意したことを記録する(引数なし。番号も日時も DB が決める)。record_agreement の旧い本体(上限なし)の写し。
-- 戻り: recorded・already・unregistered(record_agreement と同じ)。
create function public.agree_current()
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
revoke all on function public.agree_current() from public, anon, authenticated, service_role;
grant execute on function public.agree_current() to authenticated;

-- =============================
-- 4. 旧い 2 関数を同じ名前と形で置き換える(iOS 2.0.0 と今の本番の web が呼ぶ)
-- =============================
-- current_agreement: notice_due は builtin_text が真の改定だけを数える(文をビルドに持たない改定のお知らせは、旧いクライアントに出さない)。
-- agreed は変えない。4 回目の行が無い間は、4 行とも builtin_text = true なので戻りは今と一字も変わらない。
create or replace function public.current_agreement()
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
         and r.builtin_text
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

-- record_agreement: 本体は旧い物の写し + 上限の塊だけ。user_agreements の行が在り、本人の番号が文書ごとの上限
-- (適用済み・notice・builtin_text の最大の番号。無ければ上限なし)より小さいときは、その文書の番号を上限までしか書かない。
-- 番号がそれ以上の人・登録の前の行(同意前の行)・上限の無い文書(terms)は今と同じく今の番号を書く。
create or replace function public.record_agreement()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub text;
  v_terms integer;
  v_privacy integer;
  v_cap_terms integer;
  v_cap_privacy integer;
  v_write_terms integer;
  v_write_privacy integer;
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
    -- 上限(旧いクライアントが文を持つ改定まで)。無い文書(null)には掛けない。
    select pg_catalog.max(r.version) into v_cap_terms
      from private.legal_revisions r
     where r.doc = 'terms' and r.effective_at <= now() and r.notice and r.builtin_text;
    select pg_catalog.max(r.version) into v_cap_privacy
      from private.legal_revisions r
     where r.doc = 'privacy' and r.effective_at <= now() and r.notice and r.builtin_text;
    v_write_terms := case
      when v_cap_terms is not null and coalesce(v_row.agreed_terms_version, 0) < v_cap_terms then v_cap_terms
      else v_terms end;
    v_write_privacy := case
      when v_cap_privacy is not null and coalesce(v_row.agreed_privacy_version, 0) < v_cap_privacy then v_cap_privacy
      else v_privacy end;
    update public.user_agreements a
       set agreed_terms_version = v_write_terms,
           agreed_privacy_version = v_write_privacy,
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

-- =============================
-- 5. コメント
-- =============================
comment on column private.legal_revisions.builtin_text is 'お知らせの文をビルドに持つクライアント(iOS 2.0.0 まで・今の本番の web)が出してよい改定か。今の 4 行は true。以後の行は既定の false(文は notice_ja・notice_en で DB から返す)。旧い current_agreement の notice_due と record_agreement の上限は、true の改定だけを数える';
comment on column private.legal_revisions.notice_ja is 'お知らせの本文(日本語・段落ごと)。日付は {date} と書き、クライアントが agreement_state の notice_effective_on で埋める。notice が真で builtin_text が偽の行は必須(CHECK)';
comment on column private.legal_revisions.notice_en is 'お知らせの本文(英語・段落ごと)。notice_ja と同じ';

comment on function private.lists_ok() is
  'リストを開いてよい本人か。本人(JWT の sub)の user_agreements の agreed_privacy_version が 4 以上で、legal_revisions に (privacy, 4) の行が在り effective_at <= now() のときだけ真。行が無い・適用の前・user_agreements の行が無いは偽。public.lists・public.list_places の restrictive policy と agreement_state の lists_open が使う。EXECUTE は authenticated のみ';
comment on policy "lists_gate" on public.lists is 'リストの門(restrictive・全操作)。private.lists_ok() が真の本人にだけ、持ち主の policy が効く';
comment on policy "list_places_gate" on public.list_places is 'リストの門(restrictive・全操作)。private.lists_ok() が真の本人にだけ、持ち主の policy が効く';

comment on function public.agreement_state() is
  '同意の状態を必ず 1 行で返す。agreed と notice_due は current_agreement と同じ決め方(builtin_text を問わず全ての notice の改定を数える)。notice_due が真のとき、notice_effective_on(適用の日の日本標準時の暦日 YYYY.MM.DD)・notice_ja・notice_en は、本人の番号より大きい適用済みの notice の改定のうち effective_at が最も後の行の物(偽なら null)。lists_open は private.lists_ok()。登録の前の人・どちらの行も無い人は notice_due・lists_open とも偽。有効なログインでなければ not authenticated。EXECUTE は authenticated のみ';
comment on function public.agree_current() is
  '今の番号(private.legal_revisions の effective_at <= now() の最大)への同意を記録する。引数なし。record_agreement の旧い本体の写し(上限なし)。戻り: recorded・already・unregistered。どちらの表にも行は作らない。有効なログインでなければ not authenticated。EXECUTE は authenticated のみ';
comment on function public.current_agreement() is
  '今の番号に同意しているか(agreed)と、お知らせを出すか(notice_due = 本人の番号より大きい notice で builtin_text の改定が適用済みで在る)を必ず 1 行で返す。旧いクライアント(iOS 2.0.0・今の本番の web)用。builtin_text でない改定は数えない(新しいクライアントは agreement_state を使う)。user_agreements の行が無く同意前の行が在る時は、その番号で agreed を決め、notice_due は常に false。どちらの行も無ければ両方 false。本人の行だけを見る。有効なログインでなければ not authenticated。EXECUTE は authenticated のみ';
comment on function public.record_agreement() is
  'ログインの画面・改定のお知らせでの同意を、今の番号(private.legal_revisions の effective_at <= now() の最大)で記録する。引数なし。旧いクライアント用。user_agreements の本人の行が在れば、番号が適用済み・notice・builtin_text の最大の番号(文書ごと。無ければ上限なし)より小さい文書は、その番号までしか書かない(文をビルドに持たない改定へ旧いクライアントが同意を記録しないため)。無ければ同意前の行(claimed_at が null)へ今の番号を書く。戻り: recorded(書いた)・already(今の番号以上が入っていた)・unregistered(どちらの行も無い・削除中の印)。どちらの表にも行は作らない。有効なログインでなければ not authenticated。EXECUTE は authenticated のみ';

notify pgrst, 'reload schema';
