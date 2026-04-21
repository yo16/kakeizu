-- Migration: share_link テーブル作成
-- Topic: 家系図の共有 URL 管理

CREATE TABLE public.share_link (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id     uuid        NOT NULL UNIQUE REFERENCES public.tree(id) ON DELETE CASCADE,
  token       text        NOT NULL UNIQUE,
  is_enabled  boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

-- UNIQUE インデックス: token (NFR-S2: 高速かつ安全なトークン検索)
-- UNIQUE 制約により自動的に作成されるが、明示的に記述しておく
-- CREATE UNIQUE INDEX uidx_share_link_token ON public.share_link (token);
-- (UNIQUE 制約で既に作成されるため追加インデックスは不要)

-- RLS 有効化
ALTER TABLE public.share_link ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: tree の owner のみ SELECT
-- 共有 URL の token 検索は Service Role 経由で行い、ここには書かない
CREATE POLICY "share_link_select_owner"
  ON public.share_link
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = share_link.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: tree の owner のみ INSERT
CREATE POLICY "share_link_insert_owner"
  ON public.share_link
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = share_link.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: tree の owner のみ UPDATE
CREATE POLICY "share_link_update_owner"
  ON public.share_link
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = share_link.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = share_link.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: tree の owner のみ DELETE
CREATE POLICY "share_link_delete_owner"
  ON public.share_link
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = share_link.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );
