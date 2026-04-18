-- Migration: person テーブル作成
-- Topic: 家系図内の人物データ

CREATE TABLE public.person (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id          uuid        NOT NULL REFERENCES public.tree(id) ON DELETE CASCADE,
  display_name     text        NOT NULL,
  family_name      text,
  given_name       text,
  maiden_name      text,
  gender           text        CHECK (gender IN ('male', 'female', 'other', 'unknown')),
  birth_year       smallint,
  birth_month      smallint    CHECK (birth_month IS NULL OR birth_month BETWEEN 1 AND 12),
  birth_day        smallint    CHECK (birth_day IS NULL OR birth_day BETWEEN 1 AND 31),
  birth_place      text,
  death_year       smallint,
  death_month      smallint    CHECK (death_month IS NULL OR death_month BETWEEN 1 AND 12),
  death_day        smallint    CHECK (death_day IS NULL OR death_day BETWEEN 1 AND 31),
  death_place      text,
  is_alive         boolean     NOT NULL DEFAULT true,
  note             text,
  -- photo テーブルはまだ存在しないため FK なし。kakeizu-pm7.3 で追加予定
  primary_photo_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- CHECK 制約: 出生年の範囲
  CONSTRAINT chk_person_birth_year
    CHECK (birth_year IS NULL OR birth_year BETWEEN 1000 AND 9999),

  -- CHECK 制約: 没年の範囲
  CONSTRAINT chk_person_death_year
    CHECK (death_year IS NULL OR death_year BETWEEN 1000 AND 9999),

  -- CHECK 制約: 没年 >= 出生年 (両方 NOT NULL のときのみ評価)
  CONSTRAINT chk_person_death_after_birth
    CHECK (birth_year IS NULL OR death_year IS NULL OR death_year >= birth_year)
);

-- updated_at 自動更新トリガ (既存の public.set_updated_at() を再利用)
CREATE TRIGGER trg_person_set_updated_at
  BEFORE UPDATE ON public.person
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- インデックス: tree_id (ツリー単位の一覧)
CREATE INDEX idx_person_tree_id ON public.person (tree_id);

-- インデックス: (tree_id, birth_year) (タイムライン用)
CREATE INDEX idx_person_tree_id_birth_year ON public.person (tree_id, birth_year);

-- RLS 有効化
ALTER TABLE public.person ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: tree の owner のみ SELECT
CREATE POLICY "person_select_owner"
  ON public.person
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = person.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: tree の owner のみ INSERT
CREATE POLICY "person_insert_owner"
  ON public.person
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = person.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: tree の owner のみ UPDATE
CREATE POLICY "person_update_owner"
  ON public.person
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = person.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = person.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: tree の owner のみ DELETE
CREATE POLICY "person_delete_owner"
  ON public.person
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = person.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );
