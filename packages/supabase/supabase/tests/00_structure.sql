-- 構造検証:enum / テーブル・カラム型 / index / 関数 / トリガー / 非存在
-- supabase test db が pgtap を注入し search_path=public,extensions を設定する。
begin;
select plan(80);

-- ===== enum =====
select has_type('public', 'saved_place_status', 'enum saved_place_status が存在する');
select enum_has_labels(
  'public', 'saved_place_status',
  ARRAY['want_to_go', 'visit_again', 'no_thanks'],
  'saved_place_status は 3 値'
);

-- ===== テーブル存在 =====
select has_table('public', 'profiles', 'profiles テーブルが存在する');
select has_table('public', 'user_agreements', 'user_agreements テーブルが存在する');
select has_table('public', 'places', 'places テーブルが存在する');
select has_table('public', 'saved_places', 'saved_places テーブルが存在する');

-- ===== profiles カラム =====
select col_type_is('public', 'profiles', 'id', 'text', 'profiles.id text(Firebase の uid)');
select col_not_null('public', 'profiles', 'id', 'profiles.id NOT NULL');
select col_type_is('public', 'profiles', 'username', 'text', 'profiles.username text');
select col_not_null('public', 'profiles', 'username', 'profiles.username NOT NULL');
select col_type_is('public', 'profiles', 'preferred_language', 'text', 'profiles.preferred_language text');
select col_not_null('public', 'profiles', 'preferred_language', 'profiles.preferred_language NOT NULL');
select col_default_is('public', 'profiles', 'preferred_language', 'ja', 'profiles.preferred_language default ja');
select col_type_is('public', 'profiles', 'created_at', 'timestamp with time zone', 'profiles.created_at timestamptz');
select col_not_null('public', 'profiles', 'created_at', 'profiles.created_at NOT NULL');
select col_has_default('public', 'profiles', 'created_at', 'profiles.created_at has default');
select col_type_is('public', 'profiles', 'updated_at', 'timestamp with time zone', 'profiles.updated_at timestamptz');
select col_not_null('public', 'profiles', 'updated_at', 'profiles.updated_at NOT NULL');
select col_has_default('public', 'profiles', 'updated_at', 'profiles.updated_at has default');

-- ===== user_agreements カラム =====
select col_type_is('public', 'user_agreements', 'user_id', 'text', 'user_agreements.user_id text(Firebase の uid)');
select col_not_null('public', 'user_agreements', 'user_id', 'user_agreements.user_id NOT NULL');
select col_type_is('public', 'user_agreements', 'agreed_at', 'timestamp with time zone', 'user_agreements.agreed_at timestamptz');
select col_not_null('public', 'user_agreements', 'agreed_at', 'user_agreements.agreed_at NOT NULL');
select col_has_default('public', 'user_agreements', 'agreed_at', 'user_agreements.agreed_at has default');
select col_type_is('public', 'user_agreements', 'created_at', 'timestamp with time zone', 'user_agreements.created_at timestamptz');
select col_not_null('public', 'user_agreements', 'created_at', 'user_agreements.created_at NOT NULL');

-- ===== places カラム(7 列のみ)=====
select col_type_is('public', 'places', 'id', 'uuid', 'places.id uuid');
select col_not_null('public', 'places', 'id', 'places.id NOT NULL');
select col_default_is('public', 'places', 'id', 'gen_random_uuid()', 'places.id default gen_random_uuid()');
select col_type_is('public', 'places', 'google_place_id', 'text', 'places.google_place_id text');
select col_not_null('public', 'places', 'google_place_id', 'places.google_place_id NOT NULL');
select col_type_is('public', 'places', 'latitude', 'numeric(10,7)', 'places.latitude numeric(10,7)');
select col_is_null('public', 'places', 'latitude', 'places.latitude nullable(migration 21 で NOT NULL を外した)');
select col_type_is('public', 'places', 'longitude', 'numeric(10,7)', 'places.longitude numeric(10,7)');
select col_is_null('public', 'places', 'longitude', 'places.longitude nullable(migration 21 で NOT NULL を外した)');
select col_type_is('public', 'places', 'cached_at', 'timestamp with time zone', 'places.cached_at timestamptz');
select col_not_null('public', 'places', 'cached_at', 'places.cached_at NOT NULL');
select col_has_default('public', 'places', 'cached_at', 'places.cached_at has default');
select col_type_is('public', 'places', 'created_at', 'timestamp with time zone', 'places.created_at timestamptz');
select col_type_is('public', 'places', 'updated_at', 'timestamp with time zone', 'places.updated_at timestamptz');
-- 禁止カラムが存在しないこと(Google Places API 規約:店名・住所・types 等)
select hasnt_column('public', 'places', 'name', 'places に name カラムが無い');
select hasnt_column('public', 'places', 'address', 'places に address カラムが無い');
select hasnt_column('public', 'places', 'formatted_address', 'places に formatted_address カラムが無い');
select hasnt_column('public', 'places', 'types', 'places に types カラムが無い');
select hasnt_column('public', 'places', 'phone', 'places に phone カラムが無い');
select hasnt_column('public', 'places', 'website', 'places に website カラムが無い');
select hasnt_column('public', 'places', 'opening_hours', 'places に opening_hours カラムが無い');
-- places はちょうど 7 列
select is(
  (select count(*)::int from information_schema.columns where table_schema='public' and table_name='places'),
  7, 'places はちょうど 7 列'
);

-- ===== saved_places カラム =====
select col_type_is('public', 'saved_places', 'id', 'uuid', 'saved_places.id uuid');
select col_default_is('public', 'saved_places', 'id', 'gen_random_uuid()', 'saved_places.id default gen_random_uuid()');
select col_type_is('public', 'saved_places', 'user_id', 'text', 'saved_places.user_id text(Firebase の uid)');
select col_not_null('public', 'saved_places', 'user_id', 'saved_places.user_id NOT NULL');
select col_type_is('public', 'saved_places', 'place_id', 'uuid', 'saved_places.place_id uuid');
select col_not_null('public', 'saved_places', 'place_id', 'saved_places.place_id NOT NULL');
select col_type_is('public', 'saved_places', 'status', 'public.saved_place_status', 'saved_places.status is enum');
select col_not_null('public', 'saved_places', 'status', 'saved_places.status NOT NULL');
select col_type_is('public', 'saved_places', 'memo', 'text', 'saved_places.memo text');
select col_is_null('public', 'saved_places', 'memo', 'saved_places.memo nullable');
select col_type_is('public', 'saved_places', 'source_text', 'text', 'saved_places.source_text text');
select col_is_null('public', 'saved_places', 'source_text', 'saved_places.source_text nullable');
select col_type_is('public', 'saved_places', 'source_title', 'text', 'saved_places.source_title text');
select col_is_null('public', 'saved_places', 'source_title', 'saved_places.source_title nullable');
select col_type_is('public', 'saved_places', 'created_at', 'timestamp with time zone', 'saved_places.created_at timestamptz');
select col_type_is('public', 'saved_places', 'updated_at', 'timestamp with time zone', 'saved_places.updated_at timestamptz');

-- ===== username に UNIQUE 制約が無い =====
select is(
  (select count(*)::int
     from pg_constraint c
     join pg_class t on t.oid = c.conrelid
    where t.relname = 'profiles' and c.contype = 'u'),
  0, 'profiles に UNIQUE 制約が無い(username は重複可)'
);

-- ===== saved_places に状態遷移 CHECK が無い(長さ CHECK のみ)=====
select is(
  (select count(*)::int
     from pg_constraint c
     join pg_class t on t.oid = c.conrelid
    where t.relname = 'saved_places' and c.contype = 'c'),
  3, 'saved_places の CHECK は 3 本(memo/source_text/source_title の長さのみ)'
);

-- ===== index(5 本)=====
select has_index('public', 'places', 'idx_places_lat_lng', 'idx_places_lat_lng が存在する');
select has_index('public', 'places', 'idx_places_cached_at', 'idx_places_cached_at が存在する');
select has_index('public', 'saved_places', 'idx_saved_places_user_status', 'idx_saved_places_user_status が存在する');
select has_index('public', 'saved_places', 'idx_saved_places_user', 'idx_saved_places_user が存在する');
select has_index('public', 'saved_places', 'idx_saved_places_place', 'idx_saved_places_place が存在する');

-- ===== 関数 =====
select has_function('public', 'set_updated_at', '{}'::name[], 'set_updated_at が存在する');
select hasnt_function('public', 'cleanup_pending_users', '{}'::name[], 'cleanup_pending_users は撤去済み(同意前の掃除は Firebase 側の関数が行う)');
select has_function('public', 'upsert_place', ARRAY['text','numeric','numeric']::name[], 'upsert_place が存在する');

-- ===== トリガー(3 本)=====
select has_trigger('public', 'profiles', 'trg_profiles_updated_at', 'trg_profiles_updated_at が存在する');
select has_trigger('public', 'places', 'trg_places_updated_at', 'trg_places_updated_at が存在する');
select has_trigger('public', 'saved_places', 'trg_saved_places_updated_at', 'trg_saved_places_updated_at が存在する');

-- ===== 非存在アサーション =====
select hasnt_trigger('auth', 'users', 'on_auth_user_created', 'on_auth_user_created トリガーは存在しない');
select hasnt_type('public', 'source_type', 'source_type 型は存在しない');
-- user_agreements は updated_at を持たずトリガー対象外
select hasnt_column('public', 'user_agreements', 'updated_at', 'user_agreements に updated_at が無い');

select * from finish();
rollback;
