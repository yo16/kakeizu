-- Migration: billing_event テーブル作成
-- Topic: Stripe Webhook 受信ログ (冪等性確保用)

CREATE TABLE public.billing_event (
  id              bigserial   PRIMARY KEY,
  stripe_event_id text        NOT NULL UNIQUE,
  type            text        NOT NULL,
  payload         jsonb       NOT NULL,
  processed_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS 有効化
ALTER TABLE public.billing_event ENABLE ROW LEVEL SECURITY;

-- SELECT/INSERT/UPDATE/DELETE: 一般ユーザーは全拒否 (Service Role 経由のみ)
-- UNIQUE 制約が stripe_event_id のインデックスを兼ねる
