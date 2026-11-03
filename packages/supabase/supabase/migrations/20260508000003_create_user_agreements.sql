create table public.user_agreements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agreed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.user_agreements is '規約同意の証跡。Onboarding モーダルで同意完了時に Server Action で INSERT、改竄不可';
comment on column public.user_agreements.agreed_at is '同意した日時。DB 側 default now() で記録する(INSERT 時に agreed_at を指定しない。クライアント時刻・アプリ入力値を真実源にしない)';
