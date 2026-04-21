-- Migration: photo_person_link テーブル作成
-- Topic: 写真と人物の M:N 中間テーブル

CREATE TABLE public.photo_person_link (
  photo_id    uuid        NOT NULL REFERENCES public.photo(id) ON DELETE CASCADE,
  person_id   uuid        NOT NULL REFERENCES public.person(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (photo_id, person_id)
);

-- インデックス: person_id (人物→写真検索)
CREATE INDEX idx_photo_person_link_person_id ON public.photo_person_link (person_id);

-- RLS 有効化
ALTER TABLE public.photo_person_link ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: photo の tree owner のみ SELECT
-- photo→tree→owner_user_id 経由でチェック
CREATE POLICY "photo_person_link_select_owner"
  ON public.photo_person_link
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.photo p
      JOIN public.tree t ON p.tree_id = t.id
      WHERE p.id = photo_person_link.photo_id
        AND t.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: photo の tree owner のみ INSERT
CREATE POLICY "photo_person_link_insert_owner"
  ON public.photo_person_link
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.photo p
      JOIN public.tree t ON p.tree_id = t.id
      WHERE p.id = photo_person_link.photo_id
        AND t.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: photo の tree owner のみ UPDATE
CREATE POLICY "photo_person_link_update_owner"
  ON public.photo_person_link
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.photo p
      JOIN public.tree t ON p.tree_id = t.id
      WHERE p.id = photo_person_link.photo_id
        AND t.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.photo p
      JOIN public.tree t ON p.tree_id = t.id
      WHERE p.id = photo_person_link.photo_id
        AND t.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: photo の tree owner のみ DELETE
CREATE POLICY "photo_person_link_delete_owner"
  ON public.photo_person_link
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.photo p
      JOIN public.tree t ON p.tree_id = t.id
      WHERE p.id = photo_person_link.photo_id
        AND t.owner_user_id = auth.uid()
    )
  );
