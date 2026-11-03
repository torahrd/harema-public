-- =============================
-- ローカル開発用シードデータ
-- `supabase db reset` / `supabase start` でのみ適用される(本番へは反映されない)。
-- superuser 実行のため RLS は非適用。places へは直接 INSERT する
-- (seed から upsert_place() は呼ばない。有効なログインの claim が無く、必ず例外になるため)。
-- 利用者 ID は Firebase の uid(text)。Supabase Auth の利用者(auth.users)は使わない。
-- 下の 2 人の ID は有効なログインの claim の sub としてテストが使う。
-- =============================

-- ---------- private.auth_settings(受け入れる Firebase project・local は emulator の project) ----------
-- 行が無いと private.session_ok() が全部偽になる(fail-closed)。hosted は事業者の設定の後に所有者が書く。
insert into private.auth_settings (firebase_project_id)
values ('demo-login-replace');

-- ---------- profiles(username 1〜15 / preferred_language は ja/en) ----------
insert into public.profiles (id, username, preferred_language)
values
  ('11111111-1111-1111-1111-111111111111', 'seed_user_1', 'ja'),
  ('22222222-2222-2222-2222-222222222222', 'seed_user_2', 'en');

-- ---------- user_agreements(agreed_at は指定しない = DB default に委譲) ----------
insert into public.user_agreements (user_id)
values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

-- ---------- places(実在しない dummy の google_place_id、lat/lng はレンジ内) ----------
insert into public.places (id, google_place_id, latitude, longitude)
values
  ('a0000000-0000-0000-0000-000000000001', 'seed_place_001', 35.6812362, 139.7671248),
  ('a0000000-0000-0000-0000-000000000002', 'seed_place_002', 34.7024854, 135.4959506),
  ('a0000000-0000-0000-0000-000000000003', 'seed_place_003', 43.0686710, 141.3508460);

-- ---------- saved_places(3状態を網羅。unique(user_id,place_id)により 1(user,place)1状態) ----------
insert into public.saved_places (user_id, place_id, status, memo, source_text, source_title)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'a0000000-0000-0000-0000-000000000001',
    'want_to_go',
    'テレビで見た店',
    'https://example.com/article-1',
    'おすすめグルメ特集'
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'a0000000-0000-0000-0000-000000000002',
    'visit_again',
    'また行きたい',
    null,
    null
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'a0000000-0000-0000-0000-000000000003',
    'no_thanks',
    null,
    null,
    null
  );
