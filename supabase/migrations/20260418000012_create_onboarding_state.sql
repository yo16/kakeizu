-- Migration: onboarding_state テーブル作成
-- Topic: オンボーディングウィザードの進行状態管理

CREATE TABLE public.onboarding_state (
  user_id       uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tree_id       uuid        REFERENCES public.tree(id) ON DELETE SET NULL,
  current_step  text        NOT NULL,
  is_completed  boolean     NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- updated_at 自動更新トリガ (既存の public.set_updated_at() を再利用)
CREATE TRIGGER trg_onboarding_state_set_updated_at
  BEFORE UPDATE ON public.onboarding_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS 有効化
ALTER TABLE public.onboarding_state ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: 本人のみ SELECT
CREATE POLICY "onboarding_state_select_own"
  ON public.onboarding_state
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS ポリシー: 本人のみ INSERT
CREATE POLICY "onboarding_state_insert_own"
  ON public.onboarding_state
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS ポリシー: 本人のみ UPDATE
CREATE POLICY "onboarding_state_update_own"
  ON public.onboarding_state
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
