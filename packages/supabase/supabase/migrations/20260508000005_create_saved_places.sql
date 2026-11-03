create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  status public.saved_place_status not null,
  memo text check (memo is null or char_length(memo) <= 500),
  source_text text check (source_text is null or char_length(source_text) <= 1000),
  source_title text check (source_title is null or char_length(source_title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, place_id)
);

-- ユーザー × 状態でのフィルタ(地図表示・検索)
create index idx_saved_places_user_status on public.saved_places (user_id, status);

-- ユーザーの全保存店舗取得
create index idx_saved_places_user on public.saved_places (user_id);

-- 店舗から保存ユーザーを逆引き(将来用)
create index idx_saved_places_place on public.saved_places (place_id);

comment on table public.saved_places is 'ユーザーが保存した店舗の状態・メモ・出典';
comment on column public.saved_places.status is '保存状態。3状態のうちいずれか';
comment on column public.saved_places.memo is 'ユーザーメモ(任意、500 文字まで)';
comment on column public.saved_places.source_text is '出典の自由記述または URL(任意、1000 文字まで)';
comment on column public.saved_places.source_title is '出典 URL の OGP プリフェッチ結果(og:title)のキャッシュ。任意、200 文字まで';
