-- Migration: profile テーブル作成
-- Topic: ユーザープロフィール (auth.users の 1:1 拡張)

CREATE TABLE public.profile (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at 自動更新用トリガ関数
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- profile の updated_at 自動更新トリガ
CREATE TRIGGER trg_profile_set_updated_at
  BEFORE UPDATE ON public.profile
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS 有効化
ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー
CREATE POLICY "profile_select_own"
  ON public.profile
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "profile_insert_own"
  ON public.profile
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profile_update_own"
  ON public.profile
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE は不可 (アカウント削除経由の CASCADE のみ)
