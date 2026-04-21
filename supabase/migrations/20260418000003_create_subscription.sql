-- Migration: subscription テーブル作成
-- Topic: ユーザーごとの現在の契約

CREATE TABLE public.subscription (
  user_id                uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                text        NOT NULL REFERENCES public.plan(id),
  status                 text        NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete')),
  stripe_customer_id     text        UNIQUE,
  stripe_subscription_id text        UNIQUE,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean     NOT NULL DEFAULT false,
  downgraded_at          timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- updated_at 自動更新トリガ
CREATE TRIGGER trg_subscription_set_updated_at
  BEFORE UPDATE ON public.subscription
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Stripe ID 検索用インデックス
CREATE INDEX idx_subscription_stripe_customer_id
  ON public.subscription (stripe_customer_id);

CREATE INDEX idx_subscription_stripe_subscription_id
  ON public.subscription (stripe_subscription_id);

-- RLS 有効化
ALTER TABLE public.subscription ENABLE ROW LEVEL SECURITY;

-- SELECT: 本人のみ
CREATE POLICY "subscription_select_own"
  ON public.subscription
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE: 不可 (Service Role 経由のみ)
-- Service Role は RLS をバイパスするため、ポリシーを定義しない
