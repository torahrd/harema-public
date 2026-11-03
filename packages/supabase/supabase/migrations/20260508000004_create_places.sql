create table public.places (
  id uuid primary key default gen_random_uuid(),
  google_place_id text not null unique,
  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,
  cached_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- google_place_id は UNIQUE 制約で自動的にインデックス化されるため明示作成不要
-- 地図ビューポート検索用(lat/lng 範囲クエリ)
create index idx_places_lat_lng on public.places (latitude, longitude);

-- 30 日リフレッシュ判定用(cached_at 古いレコードのバッチ処理に活用可能)
create index idx_places_cached_at on public.places (cached_at);

comment on table public.places is 'Google Places API 規約準拠キャッシュ(全認証ユーザー共有、最小構成)';
comment on column public.places.google_place_id is 'Google Places API の place_id。Google ID Caching ルールにより永続保存可';
comment on column public.places.latitude is '緯度。Places API 規約 10.3 により最大 30 日キャッシュ可';
comment on column public.places.longitude is '経度。Places API 規約 10.3 により最大 30 日キャッシュ可';
comment on column public.places.cached_at is 'Google API から最後に取得した日時。30 日経過時点でリフレッシュ要';
