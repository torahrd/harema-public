-- Place Details を経ない利用者 JWT から共有 places を汚染できないようにする。
-- サーバは service_role のテーブル権限で検証済み座標だけを書き込む。
revoke execute on function public.upsert_place(text, numeric, numeric) from authenticated;

comment on function public.upsert_place is
  '旧書込経路。authenticated と anon には EXECUTE を付与しない。共有 places の書込はサーバが Place Details で検証した後、service_role のテーブル権限で行う。';
