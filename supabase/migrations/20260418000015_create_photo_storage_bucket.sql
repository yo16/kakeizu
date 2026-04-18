-- Migration: photos Storage バケット作成 + Storage RLS ポリシー設定
-- Topic: Storage バケット定義と storage.objects への RLS ポリシー実装

-- ------------------------------------------------------------------
-- 1. photos バケット作成
-- ------------------------------------------------------------------
-- オブジェクトキー命名規則: photos/{ownerUserId}/{treeId}/{photoId}.{ext}
-- public = false (署名 URL 経由でのみアクセス可能)
-- file_size_limit = 5242880 bytes (5 MB)
-- allowed_mime_types: image/jpeg, image/png, image/webp
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------
-- 2. Storage RLS ポリシー (storage.objects)
-- ------------------------------------------------------------------
-- storage.objects の RLS は Supabase が自動的に有効化しているため ALTER TABLE は不要
--
-- パス構造: photos/{ownerUserId}/{treeId}/{photoId}.{ext}
-- storage.foldername(name) は name をスラッシュ区切りで配列化する関数 (1-indexed)
-- (storage.foldername(name))[1] = ownerUserId
--
-- 所有者判定: path の第1セグメント = auth.uid()::text

-- 2-1. SELECT: 認証済みユーザーは自身のオブジェクトのみ取得可能
CREATE POLICY "photos_storage_select_owner"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2-2. INSERT: 認証済みユーザーは自身の所有パスにのみアップロード可能
CREATE POLICY "photos_storage_insert_owner"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2-3. UPDATE: 認証済みユーザーは自身のオブジェクトのみ更新可能
CREATE POLICY "photos_storage_update_owner"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2-4. DELETE: 認証済みユーザーは自身のオブジェクトのみ削除可能
CREATE POLICY "photos_storage_delete_owner"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
