/**
 * photos ストレージバケット + Storage RLS ポリシーのテスト
 *
 * マイグレーションファイル: 20260418000015_create_photo_storage_bucket.sql
 *
 * テスト観点:
 * --- バケット設定 ---
 * - [正常系] photos バケットが storage.buckets に存在する
 * - [正常系] public = false
 * - [正常系] file_size_limit = 5242880 (5MB)
 * - [正常系] allowed_mime_types = ['image/jpeg', 'image/png', 'image/webp']
 * - [正常系] id = 'photos' で ON CONFLICT DO NOTHING（冪等性確認）
 *
 * --- SELECT RLS ---
 * - [正常系] 認証ユーザーが自分のフォルダのオブジェクトを SELECT できる
 * - [異常系] 他人のフォルダのオブジェクトは SELECT できない（空配列）
 * - [異常系] anon ユーザーは SELECT できない
 *
 * --- INSERT RLS ---
 * - [正常系] 認証ユーザーが自分のフォルダへアップロードできる
 * - [異常系] 他人のフォルダへのアップロードは失敗する
 * - [異常系] anon ユーザーはアップロードできない
 *
 * --- UPDATE (move) RLS ---
 * - [正常系] 自分のフォルダ内での move は成功する
 * - [異常系] 他人のフォルダへの move は失敗する
 *
 * --- DELETE RLS ---
 * - [正常系] 自分のオブジェクトを削除できる
 * - [異常系] 他人のオブジェクトの削除は失敗する（残存確認）
 */

import {
  adminClient,
  anonClient,
  createTestUser,
  createUserClient,
  deleteTestUser,
} from '../helpers/supabase-clients';

jest.setTimeout(30000);

// テスト用ダミーファイル生成
function createTestBlob(type = 'image/jpeg'): Blob {
  return new Blob(['fake-image-data'], { type });
}

describe('photos ストレージバケット + Storage RLS', () => {
  const createdUserIds: string[] = [];
  // afterEach でクリーンアップするオブジェクトパスを追跡する
  const createdObjectPaths: string[] = [];

  afterEach(async () => {
    // アップロードしたオブジェクトを削除
    if (createdObjectPaths.length > 0) {
      await adminClient.storage.from('photos').remove([...createdObjectPaths]);
      createdObjectPaths.length = 0;
    }
    // テストユーザーを削除
    for (const userId of createdUserIds) {
      await deleteTestUser(userId).catch(() => {
        // 既に削除済みの場合は無視
      });
    }
    createdUserIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // ヘルパー: テストユーザーを作成してユーザー ID とクライアントを返す
  // ---------------------------------------------------------------------------
  async function setupUser(suffix: string) {
    const email = `test-storage-${suffix}-${Date.now()}@example.com`;
    const userId = await createTestUser(email, 'Password123!');
    createdUserIds.push(userId);
    const client = await createUserClient(email, 'Password123!');
    return { email, userId, client };
  }

  // ---------------------------------------------------------------------------
  // ヘルパー: adminClient でオブジェクトをアップロードしてパスを追跡する
  // ---------------------------------------------------------------------------
  async function adminUpload(path: string): Promise<void> {
    const { error } = await adminClient.storage
      .from('photos')
      .upload(path, createTestBlob(), { contentType: 'image/jpeg', upsert: true });
    if (error) {
      throw new Error(`adminUpload 失敗: ${error.message} (path: ${path})`);
    }
    createdObjectPaths.push(path);
  }

  // ===========================================================================
  // バケット設定の検証
  // ===========================================================================
  describe('バケット設定', () => {
    it('[正常系] photos バケットが storage.buckets に存在する', async () => {
      const { data, error } = await adminClient.storage.getBucket('photos');

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.id).toBe('photos');
      expect(data!.name).toBe('photos');
    });

    it('[正常系] photos バケットは public = false', async () => {
      const { data, error } = await adminClient.storage.getBucket('photos');

      expect(error).toBeNull();
      expect(data!.public).toBe(false);
    });

    it('[正常系] photos バケットの file_size_limit = 5242880 (5MB)', async () => {
      const { data, error } = await adminClient.storage.getBucket('photos');

      expect(error).toBeNull();
      expect(data!.file_size_limit).toBe(5242880);
    });

    it('[正常系] photos バケットの allowed_mime_types = [image/jpeg, image/png, image/webp]', async () => {
      const { data, error } = await adminClient.storage.getBucket('photos');

      expect(error).toBeNull();
      const mimeTypes: string[] = (data!.allowed_mime_types ?? []) as string[];
      expect(mimeTypes).toContain('image/jpeg');
      expect(mimeTypes).toContain('image/png');
      expect(mimeTypes).toContain('image/webp');
      expect(mimeTypes).toHaveLength(3);
    });

    it('[正常系] 重複作成を試みても photos バケットは 1 件のまま', async () => {
      // Supabase Storage API 経由で同名バケットの作成を試みる
      // マイグレーションの ON CONFLICT DO NOTHING と等価な挙動を確認する
      // （失敗するが、結果として1件のみ残ることが重要）
      await adminClient.storage.createBucket('photos', {
        public: false,
      });

      // listBuckets で photos バケットが1件だけあることを確認
      const { data: buckets, error } = await adminClient.storage.listBuckets();
      expect(error).toBeNull();
      const photosBuckets = (buckets ?? []).filter((b) => b.id === 'photos');
      expect(photosBuckets).toHaveLength(1);
    });
  });

  // ===========================================================================
  // SELECT RLS
  // ===========================================================================
  describe('Storage RLS: SELECT', () => {
    it('[正常系] 認証ユーザーが自分のフォルダのオブジェクトを list できる', async () => {
      const { userId, client } = await setupUser('sel-ok');
      const path = `${userId}/test-sel-ok.jpg`;
      await adminUpload(path);

      const { data, error } = await client.storage.from('photos').list(userId);

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      const found = data!.some((obj) => obj.name === 'test-sel-ok.jpg');
      expect(found).toBe(true);
    });

    it('[異常系] 他人のフォルダのオブジェクトは list できない（空配列）', async () => {
      const { userId: userIdA } = await setupUser('sel-ng-a');
      const { client: clientB } = await setupUser('sel-ng-b');

      const path = `${userIdA}/test-sel-ng.jpg`;
      await adminUpload(path);

      // ユーザー B がユーザー A のフォルダを list する
      const { data, error } = await clientB.storage.from('photos').list(userIdA);

      // RLS により空配列が返る（エラーなし・アイテムなし）
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[異常系] anon ユーザーは他人のフォルダを list できない', async () => {
      const { userId } = await setupUser('sel-anon');
      const path = `${userId}/test-sel-anon.jpg`;
      await adminUpload(path);

      const { data, error } = await anonClient.storage.from('photos').list(userId);

      // anon は authenticated ロールでないので RLS により空またはエラー
      // Supabase Storage は anon に対して空配列を返すことが多い
      if (error) {
        expect(error.message).toBeDefined();
      } else {
        expect(data).toHaveLength(0);
      }
    });
  });

  // ===========================================================================
  // INSERT RLS (upload)
  // ===========================================================================
  describe('Storage RLS: INSERT (upload)', () => {
    it('[正常系] 認証ユーザーが自分のフォルダへアップロードできる', async () => {
      const { userId, client } = await setupUser('ins-ok');
      const path = `${userId}/test-ins-ok.jpg`;

      const { data, error } = await client.storage
        .from('photos')
        .upload(path, createTestBlob(), { contentType: 'image/jpeg' });

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      // クリーンアップ対象に追加
      createdObjectPaths.push(path);
    });

    it('[異常系] 他人のフォルダへのアップロードは失敗する', async () => {
      const { userId: userIdA } = await setupUser('ins-ng-a');
      const { client: clientB } = await setupUser('ins-ng-b');

      const path = `${userIdA}/test-ins-ng.jpg`;

      const { data, error } = await clientB.storage
        .from('photos')
        .upload(path, createTestBlob(), { contentType: 'image/jpeg' });

      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('[異常系] anon ユーザーはアップロードできない', async () => {
      const path = `anon-user-id/test-ins-anon.jpg`;

      const { data, error } = await anonClient.storage
        .from('photos')
        .upload(path, createTestBlob(), { contentType: 'image/jpeg' });

      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });
  });

  // ===========================================================================
  // UPDATE RLS (move)
  // ===========================================================================
  describe('Storage RLS: UPDATE (move)', () => {
    it('[正常系] 自分のフォルダ内での move は成功する', async () => {
      const { userId, client } = await setupUser('upd-ok');
      const fromPath = `${userId}/test-move-src.jpg`;
      const toPath = `${userId}/test-move-dst.jpg`;
      await adminUpload(fromPath);
      // 移動先もクリーンアップ対象に登録
      createdObjectPaths.push(toPath);

      const { error } = await client.storage.from('photos').move(fromPath, toPath);

      expect(error).toBeNull();

      // 移動後、移動元が存在しないことを adminClient で確認
      const { data: listSrc } = await adminClient.storage
        .from('photos')
        .list(userId, { search: 'test-move-src.jpg' });
      const srcExists = (listSrc ?? []).some((o) => o.name === 'test-move-src.jpg');
      expect(srcExists).toBe(false);

      // 移動元パスは createdObjectPaths から除去（既に移動済み）
      const srcIdx = createdObjectPaths.indexOf(fromPath);
      if (srcIdx !== -1) createdObjectPaths.splice(srcIdx, 1);
    });

    it('[異常系] 他人のフォルダへの move は失敗する', async () => {
      const { userId: userIdA, client: clientA } = await setupUser('upd-ng-a');
      const { userId: userIdB } = await setupUser('upd-ng-b');

      const fromPath = `${userIdA}/test-move-ng-src.jpg`;
      const toPath = `${userIdB}/test-move-ng-dst.jpg`;
      await adminUpload(fromPath);

      const { error } = await clientA.storage.from('photos').move(fromPath, toPath);

      expect(error).not.toBeNull();

      // move 失敗後、移動元が残存していることを adminClient で確認
      const { data: listSrc } = await adminClient.storage
        .from('photos')
        .list(userIdA, { search: 'test-move-ng-src.jpg' });
      const srcExists = (listSrc ?? []).some((o) => o.name === 'test-move-ng-src.jpg');
      expect(srcExists).toBe(true);
    });
  });

  // ===========================================================================
  // DELETE RLS (remove)
  // ===========================================================================
  describe('Storage RLS: DELETE (remove)', () => {
    it('[正常系] 自分のオブジェクトを削除できる', async () => {
      const { userId, client } = await setupUser('del-ok');
      const path = `${userId}/test-del-ok.jpg`;
      await adminUpload(path);

      const { data, error } = await client.storage.from('photos').remove([path]);

      expect(error).toBeNull();
      expect(data).not.toBeNull();

      // 削除後、オブジェクトが存在しないことを adminClient で確認
      const { data: listAfter } = await adminClient.storage
        .from('photos')
        .list(userId, { search: 'test-del-ok.jpg' });
      const exists = (listAfter ?? []).some((o) => o.name === 'test-del-ok.jpg');
      expect(exists).toBe(false);

      // afterEach でのダブル削除を防ぐため createdObjectPaths から除去
      const idx = createdObjectPaths.indexOf(path);
      if (idx !== -1) createdObjectPaths.splice(idx, 1);
    });

    it('[異常系] 他人のオブジェクトの削除は失敗し、オブジェクトが残存する', async () => {
      const { userId: userIdA } = await setupUser('del-ng-a');
      const { client: clientB } = await setupUser('del-ng-b');

      const path = `${userIdA}/test-del-ng.jpg`;
      await adminUpload(path);

      const { error } = await clientB.storage.from('photos').remove([path]);

      // RLS 違反によりエラーが返る、またはエラーなし・削除0件
      // いずれの場合もオブジェクトが残存していることを確認する
      if (error) {
        expect(error.message).toBeDefined();
      }

      // adminClient でオブジェクトの残存を確認
      const { data: listAfter } = await adminClient.storage
        .from('photos')
        .list(userIdA, { search: 'test-del-ng.jpg' });
      const exists = (listAfter ?? []).some((o) => o.name === 'test-del-ng.jpg');
      expect(exists).toBe(true);
    });
  });
});
