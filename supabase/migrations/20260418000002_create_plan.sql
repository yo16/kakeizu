-- Migration: plan テーブル作成
-- Topic: プランマスタ (free / basic / standard / enterprise)

CREATE TABLE public.plan (
  id                    text     PRIMARY KEY,
  name                  text     NOT NULL,
  monthly_price_jpy     integer  NOT NULL,
  max_trees             integer  NOT NULL,
  max_persons_per_tree  integer  NOT NULL,
  max_photos_per_person integer  NOT NULL,
  stripe_price_id       text     UNIQUE,
  is_active             boolean  NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- RLS 有効化
ALTER TABLE public.plan ENABLE ROW LEVEL SECURITY;

-- SELECT: 全ユーザー (認証問わず) — 料金ページ表示用
CREATE POLICY "plan_select_all"
  ON public.plan
  FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE: 不可 (管理者は SQL 直接編集)
