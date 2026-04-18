-- Migration: person.primary_photo_id に FK 制約を追加
-- Topic: photo テーブル作成後に person の代表写真 FK を追加
-- 前タスク (kakeizu-pm7.1) では photo テーブルが未存在のため FK なしで作成していた

ALTER TABLE public.person
  ADD CONSTRAINT fk_person_primary_photo
  FOREIGN KEY (primary_photo_id) REFERENCES public.photo(id)
  ON DELETE SET NULL;
