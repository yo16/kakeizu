-- Migration: tree テーブル作成
-- Topic: 家系図メタデータ

CREATE TABLE public.tree (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title          text        NOT NULL,
  description    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- updated_at 自動更新トリガ (既存の public.set_updated_at() を再利用)
CREATE TRIGGER trg_tree_set_updated_at
  BEFORE UPDATE ON public.tree
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- インデックス: owner_user_id (一覧取得用)
CREATE INDEX idx_tree_owner_user_id ON public.tree (owner_user_id);

-- RLS 有効化
ALTER TABLE public.tree ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: 本人のみ SELECT
CREATE POLICY "tree_select_own"
  ON public.tree
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_user_id);

-- RLS ポリシー: 本人のみ INSERT
CREATE POLICY "tree_insert_own"
  ON public.tree
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

-- RLS ポリシー: 本人のみ UPDATE
CREATE POLICY "tree_update_own"
  ON public.tree
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- RLS ポリシー: 本人のみ DELETE
CREATE POLICY "tree_delete_own"
  ON public.tree
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_user_id);
