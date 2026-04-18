-- シードデータ

-- plan マスタ (4 プラン)
-- max_trees, max_persons_per_tree, max_photos_per_person の -1 は「無制限」を表す
INSERT INTO public.plan (id, name, monthly_price_jpy, max_trees, max_persons_per_tree, max_photos_per_person, stripe_price_id, is_active)
VALUES
  ('free',       'Free',       0,     1,  5,  2,  NULL,                          true),
  ('basic',      'Basic',      500,   2,  20, 5,  'price_basic_jpy_monthly',     true),
  ('standard',   'Standard',   2000,  5,  40, 10, 'price_standard_jpy_monthly',  true),
  ('enterprise', 'Enterprise', 0,     -1, -1, -1, NULL,                          true)
ON CONFLICT (id) DO NOTHING;
