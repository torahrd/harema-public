-- place-refresh(#39): 店の座標を 30 日以内に保つ。
--
-- 守るもの: Google Places の規約が許す座標のキャッシュは最大 30 日。places の行はこの期限を越えて持たない。
-- 方式(C): 取り直す(毎日 1 回・Vercel Cron → Route Handler)+ 取り直せなかった行を消す(毎時・この migration の pg_cron)。
--   消す側は Google の鍵も Vercel も使わず DB の関数だけで動く。取り直す側が止まっても(Vercel の呼び落とし・
--   CRON_SECRET の未設定・枠切れ)規約の 30 日が守られる = 30 日の守りの最後。
--
-- 線: 取り直しの対象は cached_at が 22 日より前、消す線は 29 日。
--   消す処理は毎時なので最長 29 日 + 1 時間 < 30 日(pg_cron が 23 時間止まっても 30 日を越えない)。
--   1 つの店に 22〜28 日目の 7 回の取り直しの機会がある。
--   線は共有の関数にせず、claim・purge の本体に定数で書く(どちらも 1 か所からしか使わない)。
--
-- 保存と競合しない消し方: saved_places.place_id は on delete cascade なので、参照の検査と削除の間に
--   保存が入ると、その保存が黙って消える。purge は候補を FOR UPDATE SKIP LOCKED で 1 行ずつ取り、
--   取った後に別の文で参照が無いことを確かめ直してから消す。
--   - 保存の外部キーの確認は places の行に FOR KEY SHARE を取るので、保存の途中の行は skip locked で飛ぶ。
--   - 行を取った後に始まる保存は、こちらの終わりまで待ってから外部キーの違反で失敗する(黙って消えない)。
--   - 取る前に確定した保存は、確かめ直しの文(READ COMMITTED は文ごとに新しい snapshot)が見つけて消さない。
--   - 候補の文にも not exists を入れる。確かめ直しで残した行は次の周の候補から外れ、繰り返しが終わる。
--   関数は VOLATILE(既定)のまま。STABLE にすると文ごとの新しい snapshot が無くなり、確かめ直しが効かない。
--
-- 台帳 private.place_refresh_runs: 取り直しの対象を返す関数は UTC の 1 日に 1 回しか行を返さない。
--   これが無いと Vercel の重複配信の日は 80 件、CRON_SECRET が漏れれば 265 件まで焼かれ、その日は全員の保存が止まる。
--   run_day は主キーで、同時の 2 本目の insert … on conflict do nothing は 1 本目の commit まで待ってから何もしない。

-- =============================
-- 1. 座標を nullable に(29 日を超えた保存済みの行は座標だけ null にして行は残す)
-- =============================
alter table public.places
  alter column latitude drop not null,
  alter column longitude drop not null;

alter table public.places
  add constraint places_coords_both_or_neither check ((latitude is null) = (longitude is null));

comment on column public.places.latitude is '緯度。Places API 規約 10.3 により最大 30 日キャッシュ可。cached_at から 29 日を超えると DB の毎時の処理(purge_stale_place_coordinates)が null にする';
comment on column public.places.longitude is '経度。Places API 規約 10.3 により最大 30 日キャッシュ可。cached_at から 29 日を超えると DB の毎時の処理(purge_stale_place_coordinates)が null にする';

-- =============================
-- 2. 台帳(UTC の 1 日に 1 回)
-- =============================
create table private.place_refresh_runs (
  run_day date primary key,
  claimed_at timestamptz not null default now()
);

alter table private.place_refresh_runs enable row level security;
-- ポリシーは作らない(fail-closed)。権限も付けない。claim_place_refresh_batch(SECURITY DEFINER)だけが触る。
revoke all on table private.place_refresh_runs from public, anon, authenticated, service_role;

comment on table private.place_refresh_runs is
  '定期の取り直しの台帳。UTC の日付ごとに 1 行。claim_place_refresh_batch が 1 日 1 回だけ対象を返すための記録で、重複配信・秘密の漏れでも 1 日の件数が上限を越えないようにする';

-- =============================
-- 3. 取り直しの対象を返す(サーバ = service_role だけ)
-- =============================
create function public.claim_place_refresh_batch(p_limit integer)
returns table (google_place_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 265 then
    raise exception 'invalid p_limit';
  end if;

  insert into private.place_refresh_runs (run_day)
  values ((now() at time zone 'utc')::date)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return;
  end if;

  -- 座標の残る行(22〜28 日目)を先に、座標の消えた行は残りの枠で。その中は無作為(古い順にしない)。
  return query
    select p.google_place_id
      from public.places p
     where p.cached_at < now() - interval '22 days'
       and exists (select 1 from public.saved_places s where s.place_id = p.id)
     order by (p.latitude is null), random()
     limit p_limit;
end;
$$;

revoke all on function public.claim_place_refresh_batch(integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_place_refresh_batch(integer) to service_role;

comment on function public.claim_place_refresh_batch is
  '定期の取り直しの対象(保存されていて cached_at が 22 日より前の places の google_place_id)を、UTC の 1 日に 1 回だけ最大 p_limit 件返す。service_role(サーバ)だけが呼べる。利用者の ID は返さない';

-- =============================
-- 4. 29 日を超えた行を消す・座標を null にする(pg_cron・所有者の権限)
-- =============================
create function private.purge_stale_place_coordinates()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- 誰も保存していない古い行は行ごと消す。保存と競合しない形(冒頭の説明)。
  loop
    select p.id into v_id
      from public.places p
     where p.cached_at < now() - interval '29 days'
       and not exists (select 1 from public.saved_places s where s.place_id = p.id)
     limit 1
       for update of p skip locked;
    exit when not found;

    delete from public.places p
     where p.id = v_id
       and not exists (select 1 from public.saved_places s where s.place_id = p.id);
  end loop;

  -- 保存されている行は行を残し、座標だけ null にする(cached_at はそのまま)。
  update public.places
     set latitude = null, longitude = null
   where cached_at < now() - interval '29 days'
     and latitude is not null;
end;
$$;

-- pg_cron は所有者の権限で走る(20260508000009 の前例)ので、誰にも EXECUTE を付けない。
revoke all on function private.purge_stale_place_coordinates() from public, anon, authenticated, service_role;

comment on function private.purge_stale_place_coordinates is
  'places の 29 日の消去。誰も保存していない cached_at 29 日超の行を行ごと削除し、保存されている行は座標を null にする。pg_cron が毎時実行する';

select cron.schedule(
  'purge_stale_place_coordinates',
  '17 * * * *',
  $$select private.purge_stale_place_coordinates();$$
);
