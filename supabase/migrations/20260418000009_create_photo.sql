-- Migration: photo テーブル作成
-- Topic: 写真メタデータ (実体は Supabase Storage)

CREATE TABLE public.photo (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id             uuid        NOT NULL REFERENCES public.tree(id) ON DELETE CASCADE,
  storage_object_key  text        NOT NULL,
  mime_type           text        NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  width               integer,
  height              integer,
  byte_size           integer,
  taken_year          smallint,
  taken_month         smallint    CHECK (taken_month IS NULL OR taken_month BETWEEN 1 AND 12),
  taken_day           smallint    CHECK (taken_day IS NULL OR taken_day BETWEEN 1 AND 31),
  caption             text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- CHECK 制約: 撮影年の範囲
  CONSTRAINT chk_photo_taken_year
    CHECK (taken_year IS NULL OR taken_year BETWEEN 1000 AND 9999)
);

-- updated_at 自動更新トリガ (既存の public.set_updated_at() を再利用)
CREATE TRIGGER trg_photo_set_updated_at
  BEFORE UPDATE ON public.photo
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- インデックス: tree_id (ツリー写真一覧)
CREATE INDEX idx_photo_tree_id ON public.photo (tree_id);

-- インデックス: taken_year (タイムライン連動)
CREATE INDEX idx_photo_taken_year ON public.photo (taken_year);

-- RLS 有効化
ALTER TABLE public.photo ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: tree の owner のみ SELECT
CREATE POLICY "photo_select_owner"
  ON public.photo
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = photo.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: tree の owner のみ INSERT
CREATE POLICY "photo_insert_owner"
  ON public.photo
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = photo.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: tree の owner のみ UPDATE
CREATE POLICY "photo_update_owner"
  ON public.photo
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = photo.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = photo.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: tree の owner のみ DELETE
CREATE POLICY "photo_delete_owner"
  ON public.photo
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = photo.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );
