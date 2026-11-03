create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null
    check (char_length(username) between 1 and 15),
  preferred_language text not null default 'ja'
    check (preferred_language in ('ja', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'ユーザー固有設定(auth.users と 1:1)。規約同意完了時に Server Action で INSERT';
comment on column public.profiles.username is 'ユーザー名。1〜15 文字(char_length 基準、半角・全角を区別しない)。重複可、他者表示なし';
comment on column public.profiles.preferred_language is '表示言語。MVP は ja のみ、将来 en 等を追加';
