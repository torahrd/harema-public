-- 制約検証:CHECK / UNIQUE / agreed_at 自動記録 / auth.users への外部キーが無いこと
-- postgres(superuser)として実行(RLS は迂回されるが CHECK/UNIQUE は適用される)。
-- 利用者 ID は Firebase の uid(text)で auth.users への外部キーを持たないため、利用者の行は要らない。
begin;
select plan(13);

-- ===== profiles CHECK =====
select throws_ok(
  $$insert into public.profiles (id, username) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '')$$,
  '23514', null, 'username 空文字は CHECK 違反'
);
select throws_ok(
  $$insert into public.profiles (id, username) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaaaaaaaaaa')$$,
  '23514', null, 'username 16 文字は CHECK 違反'
);
select throws_ok(
  $$insert into public.profiles (id, username, preferred_language) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'ok', 'fr')$$,
  '23514', null, 'preferred_language fr は CHECK 違反'
);

-- ===== saved_places CHECK(長さ)=====
select throws_ok(
  format($$insert into public.saved_places (user_id, place_id, status, memo) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'a0000000-0000-0000-0000-000000000001', 'want_to_go', %L)$$, repeat('a', 501)),
  '23514', null, 'memo 501 文字は CHECK 違反'
);
select throws_ok(
  format($$insert into public.saved_places (user_id, place_id, status, source_text) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'a0000000-0000-0000-0000-000000000001', 'want_to_go', %L)$$, repeat('a', 1001)),
  '23514', null, 'source_text 1001 文字は CHECK 違反'
);
select throws_ok(
  format($$insert into public.saved_places (user_id, place_id, status, source_title) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'a0000000-0000-0000-0000-000000000001', 'want_to_go', %L)$$, repeat('a', 201)),
  '23514', null, 'source_title 201 文字は CHECK 違反'
);

-- ===== agreed_at:user_id のみで INSERT すると DB default now() が自動記録される =====
select lives_ok(
  $$insert into public.user_agreements (user_id) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')$$,
  'user_agreements は user_id のみで INSERT できる'
);
select ok(
  (select agreed_at is not null from public.user_agreements where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'agreed_at が自動記録される(NOT NULL)'
);
select ok(
  (select agreed_at >= now() - interval '1 minute' from public.user_agreements where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'agreed_at は DB 側 now() で直近時刻が記録される'
);

-- ===== UNIQUE(user_id, place_id)=====
select lives_ok(
  $$insert into public.saved_places (user_id, place_id, status) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'a0000000-0000-0000-0000-000000000001', 'want_to_go')$$,
  '(user_id, place_id) の 1 回目 INSERT は成功する'
);
select throws_ok(
  $$insert into public.saved_places (user_id, place_id, status) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'a0000000-0000-0000-0000-000000000001', 'visit_again')$$,
  '23505', null, '同一 (user_id, place_id) の 2 回目 INSERT は UNIQUE 違反'
);

-- ===== 利用者 ID は Firebase の uid(text)で、auth.users への外部キーが無い =====
select is(
  (select count(*)::int
     from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.conrelid in (
        'public.profiles'::regclass,
        'public.user_agreements'::regclass,
        'public.saved_places'::regclass,
        'public.ogp_fetch_attempts'::regclass
      )),
  0, '4 表のどれも auth.users への外部キーを持たない'
);
select lives_ok(
  $$insert into public.profiles (id, username) values ('Xk3f9aQ2mLp7ZrT1vB8nWc5YdE0s', 'fb_uid_user')$$,
  '28 文字の Firebase 形の uid(uuid でない)で profiles に INSERT できる'
);

select * from finish();
rollback;
