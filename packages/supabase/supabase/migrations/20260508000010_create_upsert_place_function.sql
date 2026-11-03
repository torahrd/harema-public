-- =============================
-- places 共有キャッシュへの唯一の書込経路(SECURITY DEFINER upsert)
-- =============================
create or replace function public.upsert_place(
  p_google_place_id text,
  p_latitude numeric,
  p_longitude numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- 多層防御:EXECUTE は authenticated のみに付与するが、関数内でも認証を検証する
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- サーバ取得値のサニティチェック(座標レンジ・place_id 非空)
  if p_google_place_id is null or char_length(p_google_place_id) = 0
     or p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'invalid place payload';
  end if;

  insert into public.places (google_place_id, latitude, longitude, cached_at)
  values (p_google_place_id, p_latitude, p_longitude, now())
  on conflict (google_place_id) do update
    set latitude  = excluded.latitude,
        longitude = excluded.longitude,
        cached_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.upsert_place is
  'places 共有キャッシュへの唯一の書込経路。Server Action がサーバ側 Place Details で place_id の実在検証と lat/lng 取得を行った上で呼ぶ(保存時・30 日リフレッシュ時共通)。SECURITY DEFINER で RLS(直接書込ポリシーなし)を迂回。EXECUTE は authenticated のみ';

-- =============================
-- EXECUTE 最小化(PUBLIC 既定を除去し、authenticated のみに付与)
-- =============================
revoke execute on function public.upsert_place(text, numeric, numeric) from public;
grant execute on function public.upsert_place(text, numeric, numeric) to authenticated;
