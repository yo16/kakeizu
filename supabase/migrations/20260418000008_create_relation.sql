-- Migration: relation テーブル作成
-- Topic: 人物間の関係 (親子 / 婚姻)

CREATE TABLE public.relation (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id          uuid        NOT NULL REFERENCES public.tree(id) ON DELETE CASCADE,
  kind             text        NOT NULL CHECK (kind IN ('parent_child', 'marriage')),
  from_person_id   uuid        NOT NULL REFERENCES public.person(id) ON DELETE CASCADE,
  to_person_id     uuid        NOT NULL REFERENCES public.person(id) ON DELETE CASCADE,
  parent_role      text        CHECK (parent_role IN ('biological', 'adoptive', 'step')),
  marriage_type    text        CHECK (marriage_type IN ('spouse', 'common_law', 'same_sex_partner')),
  marriage_status  text        CHECK (marriage_status IN ('current', 'divorced', 'widowed')),
  start_year       smallint,
  start_month      smallint,
  end_year         smallint,
  end_month        smallint,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- CHECK 制約: 自己参照禁止
  CONSTRAINT chk_relation_no_self_ref
    CHECK (from_person_id <> to_person_id),

  -- CHECK 制約: kind=parent_child のとき parent_role は NOT NULL、marriage_* は NULL
  CONSTRAINT chk_relation_parent_child_fields
    CHECK (
      kind <> 'parent_child'
      OR (parent_role IS NOT NULL AND marriage_type IS NULL AND marriage_status IS NULL)
    ),

  -- CHECK 制約: kind=marriage のとき marriage_type は NOT NULL、parent_role は NULL
  CONSTRAINT chk_relation_marriage_fields
    CHECK (
      kind <> 'marriage'
      OR (marriage_type IS NOT NULL AND parent_role IS NULL)
    )
);

-- インデックス: tree_id (ツリー単位の一覧)
CREATE INDEX idx_relation_tree_id ON public.relation (tree_id);

-- インデックス: (from_person_id, kind) (人物からの関係検索)
CREATE INDEX idx_relation_from_person_kind ON public.relation (from_person_id, kind);

-- インデックス: (to_person_id, kind) (人物への関係検索)
CREATE INDEX idx_relation_to_person_kind ON public.relation (to_person_id, kind);

-- 部分 UNIQUE インデックス: parent_child の重複防止
-- (from_person_id, to_person_id, parent_role) が同一の親子関係は1件のみ
CREATE UNIQUE INDEX uidx_relation_parent_child
  ON public.relation (from_person_id, to_person_id, parent_role)
  WHERE kind = 'parent_child';

-- 部分 UNIQUE 式インデックス: marriage の重複防止
-- A-B と B-A を同じペアとして扱うため LEAST/GREATEST を使用
CREATE UNIQUE INDEX uidx_relation_marriage
  ON public.relation (
    LEAST(from_person_id, to_person_id),
    GREATEST(from_person_id, to_person_id),
    marriage_type
  )
  WHERE kind = 'marriage';

-- RLS 有効化
ALTER TABLE public.relation ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: tree の owner のみ SELECT
CREATE POLICY "relation_select_owner"
  ON public.relation
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = relation.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: tree の owner のみ INSERT
CREATE POLICY "relation_insert_owner"
  ON public.relation
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = relation.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: tree の owner のみ UPDATE
CREATE POLICY "relation_update_owner"
  ON public.relation
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = relation.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = relation.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );

-- RLS ポリシー: tree の owner のみ DELETE
CREATE POLICY "relation_delete_owner"
  ON public.relation
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tree
      WHERE tree.id = relation.tree_id
        AND tree.owner_user_id = auth.uid()
    )
  );
