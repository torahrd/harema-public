-- =============================
-- 出典 OGP 取得の抑制(サーバ側・2026-08-06 裁定)
-- =============================
-- fetchSourceTitle(Server Action)は認証さえ通れば無制限に呼べ、1 回あたり最大 5 秒 × 512 KB の
-- 外向き接続が起きる。SSRF ガード(20260508000004 以降のアプリ側 ip-guard)は「どこへ繋ぐか」を
-- 絞るが「何回繋ぐか」は絞らない。
--
-- 判定をここ(DB)に置く理由は 2 つ:
--   1. クライアント側の抑制は、画面を経由せず Server Action を直接叩く呼び出しに効かない
--   2. Vercel Fluid compute はインスタンスを使い捨て、負荷に応じて複数同時に立てるので、
--      プロセス内メモリは共有状態にならない(1 インスタンスぶんしか効かない抑制は、
--      スケールアウトさせれば素通りする)
--
-- このテーブルは RLS を有効化したうえでポリシーを 1 つも作らず、GRANT も一切出さない。
-- 触れるのは下の SECURITY DEFINER 関数だけで、Data API からは到達不能(fail-closed)。
--
-- 【鍵の作り方 —— 素の SHA-256 を使わない理由】
-- url_hash はアプリ側で作る **その利用者の uid を鍵にした HMAC-SHA256**(16 進 64 文字)。
-- 素のダイジェストにしないのは、出典に使われる URL の空間が実質的に狭く(SNS の投稿・店の公式
-- サイト・グルメメディア)、総当たりや既製の対応表で元の URL に戻せるため。保存された URL は
-- saved_places.source_text に平文で載るので既知だが、**保存に至らなかった URL はこの台帳にしか
-- 残らない** —— そこが復元できると「貼ったが保存しなかった URL」という新しい個人データが生まれる。
--
-- 鍵に uid を選び、サーバ側の固定秘密(pepper)を採らなかった理由:dedup が要求するのは
-- 「同じ利用者が同じ URL を貼ったら同じ値になる」ことだけで、uid はそれを満たしたうえで
-- 利用者を跨いだ対応表を無効化する。pepper でも同じ効果は得られるが、新しいシークレットの
-- 配布・env への追加・ローテーションを伴う。uid は既に主キーの一部として持っている値なので、
-- **秘密を 1 つも増やさずに同じ効果が得られる**方を採った。
--
-- 【この鍵で防げないこと —— 効果は限定的である】
-- 鍵にした uid は、同じ行の user_id 列にそのまま載っている。**台帳が丸ごと漏れれば鍵も一緒に
-- 漏れる**ので、特定の利用者を狙った総当たりは防げない(その人の uid で対応表を作り直せばよい)。
-- 鍵付きにして無効化できるのは「1 枚の対応表で全利用者ぶんを一度に引く」ことだけで、これは
-- 復元の単価を上げる措置にすぎない。**復元不能にしたわけではない。**
-- 実効的な緩和は下の保持期間の上限のほう —— 窓(ogp_fetch_window)を過ぎた行を残さないので、
-- 漏れた時点で台帳にあるのは高々「直近 1 窓ぶん + cron の 1 周期ぶん」になる。
-- 2 つは代替ではなく、「残す量を絞る」が主・「引く手間を上げる」が従、という関係にある。

create table public.ogp_fetch_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- URL そのものは受け取らない。抑制に必要なのは同一性だけなので、アプリ側で鍵付きハッシュに
  -- してから渡す(上の「鍵の作り方」)。
  url_hash text not null check (url_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  -- 取得済み og:title(saved_places.source_title と同じ 200 文字上限)。
  title text check (title is null or char_length(title) <= 200),
  primary key (user_id, url_hash)
);

comment on table public.ogp_fetch_attempts is
  '出典 OGP 取得の抑制台帳。同時実行 1 本 / 同一 URL の再取得抑止 / 単位時間あたりの回数上限を、インスタンスを跨いで効かせるための共有状態。claim_ogp_fetch / complete_ogp_fetch 経由でのみ読み書きされ、窓を過ぎた行は cleanup_ogp_fetch_attempts(cron)が落とす';
comment on column public.ogp_fetch_attempts.url_hash is '出典 URL の HMAC-SHA256(鍵 = その利用者の uid・16 進 64 文字)。URL 平文は保存しない。素の SHA-256 にしない理由はマイグレーション冒頭の「鍵の作り方」';
comment on column public.ogp_fetch_attempts.started_at is '取得を許可した時刻。窓(dedup・回数上限・保持期間)はここを基準にする';
comment on column public.ogp_fetch_attempts.completed_at is '取得の終了時刻。NULL かつ lease 内なら実行中(= 同時実行の上限に使う)';
comment on column public.ogp_fetch_attempts.title is '取得できた og:title。同一 URL の再取得抑止に掛かったとき、外へ出ずにこれを返す。取得できなかった場合は NULL(失敗も窓の間キャッシュする)';

alter table public.ogp_fetch_attempts enable row level security;

-- ポリシーは 1 つも作らない(RLS は全テーブルで有効という不変条件を満たしつつ、直接アクセスを
-- ポリシー不在で常に拒否する)。GRANT も出さない —— authenticated / anon / service_role の
-- いずれも到達できず、書込経路は下の関数だけになる。

-- =============================
-- 窓(唯一の定義)
-- =============================
-- この 1 つの値が 3 つの役割を兼ねる:
--   ・同一 URL の再取得抑止の長さ
--   ・回数上限を数える区間の長さ
--   ・台帳の保持期間の上限(これを過ぎた行は抑制に使われないので、持つ理由が無い)
-- claim 側の掃除と cron 側の掃除がずれると、cron が短ければ dedup が窓の途中で切れ、
-- 長ければ行が要らぬ期間残る。定義を 1 か所に閉じて、ずれ自体を作らない。
create or replace function public.ogp_fetch_window()
returns interval
language sql
immutable
set search_path = public
as $$
  select interval '10 minutes';
$$;

comment on function public.ogp_fetch_window is
  '出典 OGP 取得の抑制で使う窓。同一 URL の再取得抑止・回数上限を数える区間・ogp_fetch_attempts の保持期間の上限を兼ねる唯一の定義';

revoke execute on function public.ogp_fetch_window() from public;

-- =============================
-- 取得の許可を取る(claim)
-- =============================
-- 戻りは (allowed, cached_title) の 1 行:
--   allowed = true                    … 外向き取得を始めてよい。終わったら complete_ogp_fetch を呼ぶ
--   allowed = false, cached_title 有  … 同一 URL の取得済み結果。外へは出ずにこれを使う
--   allowed = false, cached_title 空  … 抑制。呼び出し元は「読み取れなかった」に畳む
--
-- 窓と上限の根拠(正常な利用が一切妨げられないことを下限に置いた):
--   ・lease = 10 秒 …… 取得側の締切が 5 秒(fetch-og-title.ts の OGP_TIMEOUT_MS)。
--     往復と Node 側の遅延を見て倍にしてある。プロセスが落ちても最長 10 秒で自動的に空く
--   ・窓 = 10 分(ogp_fetch_window)…… 1 枚のシートを編集している間に同じ URL を貼り直しても
--     二度と外へ出ない長さ。一方でセッションを跨げば読み直せる短さ
--   ・回数上限 = 窓あたり 30 回 …… 1 件の保存につき外向き取得は URL 1 本ぶん。
--     地図で店を探し、シートを開き、URL を貼り、状態を選んで保存する、を 10 分で 30 件は人の速度を超える。
--     貼り直し・chip を消して貼り直しは同一 URL なので dedup 側で吸収され、この上限を消費しない
create or replace function public.claim_ogp_fetch(p_url_hash text)
returns table (allowed boolean, cached_title text)
language plpgsql
security definer
set search_path = public
as $$
declare
  c_lease      constant interval := interval '10 seconds';
  c_window     constant interval := public.ogp_fetch_window();
  c_max_starts constant integer  := 30;

  v_user uuid := auth.uid();
  v_attempt public.ogp_fetch_attempts;
  v_starts integer;
begin
  -- 多層防御:EXECUTE は authenticated のみに付与するが、関数内でも認証を検証する。
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_url_hash is null or p_url_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid url hash';
  end if;

  -- 同一ユーザーの claim を直列化する。読んでから書くまでの間に別リクエストが割り込むと、
  -- 同時実行の上限も回数上限も数え落とす(同時到着はサーバレスでは普通に起きる)。
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  -- 窓から出た行を、この利用者ぶんだけ落とす。下の回数上限は「残存行数 = 窓内で許可した回数」に
  -- 依存するので、数える前に必ず通る。cron の掃除(cleanup_ogp_fetch_attempts)は最大 1 窓ぶん
  -- 遅れて走るので、判定をそちらに委ねると数え過ぎる —— 役割が違う 2 つの掃除で、これは判定側。
  delete from public.ogp_fetch_attempts
   where user_id = v_user
     and started_at < now() - c_window;

  select * into v_attempt
    from public.ogp_fetch_attempts
   where user_id = v_user
     and url_hash = p_url_hash;

  if found then
    -- 同一 URL の再取得抑止。取れていたタイトルはそのまま返す —— 貼り直しや chip を消しての
    -- 再入力といった通常操作を、抑制で失敗表示にしないため。取れていなければ空文字(失敗のキャッシュ)。
    if v_attempt.completed_at is not null then
      return query select false, coalesce(v_attempt.title, '');
      return;
    end if;
    -- 同じ URL が実行中(paste と blur の二重発火など)。
    if v_attempt.started_at > now() - c_lease then
      return query select false, ''::text;
      return;
    end if;
    -- ここに来る行は lease 切れの取りこぼし。下で claim し直す。
  end if;

  -- 同時実行の上限:別の URL が実行中なら発火させない。
  if exists (
    select 1
      from public.ogp_fetch_attempts
     where user_id = v_user
       and completed_at is null
       and started_at > now() - c_lease
  ) then
    return query select false, ''::text;
    return;
  end if;

  -- 単位時間あたりの回数上限。掃除済みなので、残存行数がそのまま窓内で許可した回数になる。
  select count(*)::int into v_starts
    from public.ogp_fetch_attempts
   where user_id = v_user;
  if v_starts >= c_max_starts then
    return query select false, ''::text;
    return;
  end if;

  insert into public.ogp_fetch_attempts (user_id, url_hash, started_at, completed_at, title)
  values (v_user, p_url_hash, now(), null, null)
  on conflict (user_id, url_hash) do update
    set started_at = now(),
        completed_at = null,
        title = null;

  return query select true, ''::text;
end;
$$;

comment on function public.claim_ogp_fetch is
  '出典 OGP 取得の許可を取る。同時実行 1 本 / 同一 URL の再取得抑止 / 10 分あたり 30 回 を 1 トランザクションで判定し、許可した場合だけ台帳に行を立てる。EXECUTE は authenticated のみ';

-- =============================
-- 取得の終了を記録する(complete)
-- =============================
-- lease を解放し、結果(取れなかった場合も)を窓の間だけキャッシュする。
create or replace function public.complete_ogp_fetch(p_url_hash text, p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  -- 実行中の行だけを閉じる。行が無ければ何もしない —— claim を経ずにキャッシュを仕込ませない
  -- (回数上限を消費せずに台帳へ書く経路を作らない)。
  update public.ogp_fetch_attempts
     set completed_at = now(),
         title = nullif(left(p_title, 200), '')
   where user_id = v_user
     and url_hash = p_url_hash
     and completed_at is null;
end;
$$;

comment on function public.complete_ogp_fetch is
  '出典 OGP 取得の終了を台帳に記録する(lease の解放と結果のキャッシュ)。claim_ogp_fetch が立てた実行中の行にしか効かない。EXECUTE は authenticated のみ';

-- =============================
-- EXECUTE 最小化(PUBLIC 既定を除去し、authenticated のみに付与)
-- =============================
revoke execute on function public.claim_ogp_fetch(text) from public;
grant execute on function public.claim_ogp_fetch(text) to authenticated;

revoke execute on function public.complete_ogp_fetch(text, text) from public;
grant execute on function public.complete_ogp_fetch(text, text) to authenticated;

-- =============================
-- 保持期間の上限(掃除 + cron)
-- =============================
-- claim の中の掃除は、呼ばれた利用者の行しか落とさない。使わなくなった利用者の行は次に本人が
-- claim するまで残り、抑制には二度と使われないのに保持され続ける —— url_hash と og:title は
-- 「貼ったが保存しなかった URL」の痕跡で、保存された URL(saved_places.source_text)と違って
-- ここにしか無い。冒頭「この鍵で防げないこと」で主たる緩和に置いたのはこの上限なので、
-- 呼び出しに依存しない掃除を別に置く(前例:cleanup_pending_users / 20260508000009)。
--
-- 周期は窓と同じ 10 分。窓より短くしても、まだ抑制に使われている行は消せないので意味が無い
-- (消せば dedup が窓の途中で切れる)。したがって最悪の残存は「窓 + 1 周期」= 20 分。
create or replace function public.cleanup_ogp_fetch_attempts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.ogp_fetch_attempts
   where started_at < now() - public.ogp_fetch_window();
end;
$$;

comment on function public.cleanup_ogp_fetch_attempts is
  '出典 OGP 取得の台帳から、窓(ogp_fetch_window)を過ぎた行を全ユーザーぶん削除する。抑制の判定に使われない行を保持しないための掃除で、pg_cron が 10 分ごとに実行する';

-- cron は関数所有者の権限で実行されるため、anon / authenticated への GRANT は不要(付与しない)。
revoke execute on function public.cleanup_ogp_fetch_attempts() from public;

-- =============================
-- Supabase Cron Job 登録(10 分ごと実行)
-- =============================
select cron.schedule(
  'cleanup_ogp_fetch_attempts',
  '*/10 * * * *',
  $$select public.cleanup_ogp_fetch_attempts();$$
);
