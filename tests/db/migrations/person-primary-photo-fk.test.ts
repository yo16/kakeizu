/**
 * person.primary_photo_id FK 制約のマイグレーションテスト
 *
 * マイグレーションファイル: 20260418000014_add_person_primary_photo_fk.sql
 *
 * テスト観点:
 * - [正常系] person に primary_photo_id を設定できる（同じ tree の photo を参照）
 * - [正常系] photo を削除すると person.primary_photo_id が NULL になる（ON DELETE SET NULL）
 * - [異常系] 存在しない photo_id を primary_photo_id に設定すると FK 違反（23503）
 */

import {
  adminClient,
  createTestUser,
  deleteTestUser,
} from '../helpers/supabase-clients';

jest.setTimeout(30000);

describe('person.primary_photo_id FK 制約', () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    for (const userId of createdUserIds) {
      await deleteTestUser(userId).catch(() => {
        // 既に削除済みの場合は無視
      });
    }
    createdUserIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // ヘルパー: owner のユーザーと tree を作成して返す
  // ---------------------------------------------------------------------------
  async function setupOwnerAndTree(suffix: string) {
    const email = `test-ppfk-${suffix}-${Date.now()}@example.com`;
    const userId = await createTestUser(email, 'Password123!');
    createdUserIds.push(userId);

    const { data: tree } = await adminClient
      .from('tree')
      .insert({ owner_user_id: userId, title: 'テスト家系図' })
      .select()
      .single();

    return { email, userId, tree: tree! };
  }

  // ---------------------------------------------------------------------------
  // ヘルパー: photo を adminClient で作成して返す
  // ---------------------------------------------------------------------------
  async function createPhoto(treeId: string) {
    const { data } = await adminClient
      .from('photo')
      .insert({
        tree_id: treeId,
        storage_object_key: `photos/${Date.now()}.jpg`,
        mime_type: 'image/jpeg',
      })
      .select()
      .single();
    return data!;
  }

  // ---------------------------------------------------------------------------
  // ヘルパー: person を adminClient で作成して返す
  // ---------------------------------------------------------------------------
  async function createPerson(treeId: string, primaryPhotoId?: string | null) {
    const { data } = await adminClient
      .from('person')
      .insert({
        tree_id: treeId,
        display_name: 'テスト人物',
        primary_photo_id: primaryPhotoId ?? null,
      })
      .select()
      .single();
    return data!;
  }

  // ---------------------------------------------------------------------------
  // 正常系: primary_photo_id の設定
  // ---------------------------------------------------------------------------
  describe('primary_photo_id: 設定と参照', () => {
    it('[正常系] person に primary_photo_id を設定できる', async () => {
      const { tree } = await setupOwnerAndTree('set-photo');

      const photo = await createPhoto(tree.id);
      const person = await createPerson(tree.id, photo.id);

      expect(person.primary_photo_id).toBe(photo.id);
    });

    it('[正常系] INSERT 後に UPDATE で primary_photo_id を設定できる', async () => {
      const { tree } = await setupOwnerAndTree('update-photo');

      const photo = await createPhoto(tree.id);
      const person = await createPerson(tree.id, null);

      // primary_photo_id が null であることを確認
      expect(person.primary_photo_id).toBeNull();

      // UPDATE で primary_photo_id を設定
      const { error } = await adminClient
        .from('person')
        .update({ primary_photo_id: photo.id })
        .eq('id', person.id);

      expect(error).toBeNull();

      const { data: after } = await adminClient
        .from('person')
        .select('primary_photo_id')
        .eq('id', person.id)
        .single();
      expect(after!.primary_photo_id).toBe(photo.id);
    });

    it('[正常系] primary_photo_id を NULL に設定できる', async () => {
      const { tree } = await setupOwnerAndTree('null-photo');

      const photo = await createPhoto(tree.id);
      const person = await createPerson(tree.id, photo.id);

      // primary_photo_id が設定されていることを確認
      expect(person.primary_photo_id).toBe(photo.id);

      // UPDATE で NULL に変更
      const { error } = await adminClient
        .from('person')
        .update({ primary_photo_id: null })
        .eq('id', person.id);

      expect(error).toBeNull();

      const { data: after } = await adminClient
        .from('person')
        .select('primary_photo_id')
        .eq('id', person.id)
        .single();
      expect(after!.primary_photo_id).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: ON DELETE SET NULL
  // ---------------------------------------------------------------------------
  describe('ON DELETE SET NULL: photo 削除で primary_photo_id が NULL に', () => {
    it('[正常系] photo を削除すると person.primary_photo_id が NULL になる', async () => {
      const { tree } = await setupOwnerAndTree('on-delete-set-null');

      const photo = await createPhoto(tree.id);
      const person = await createPerson(tree.id, photo.id);

      // primary_photo_id が設定されていることを確認
      const { data: before } = await adminClient
        .from('person')
        .select('primary_photo_id')
        .eq('id', person.id)
        .single();
      expect(before!.primary_photo_id).toBe(photo.id);

      // photo を削除
      await adminClient.from('photo').delete().eq('id', photo.id);

      // person.primary_photo_id が NULL に更新されていることを確認
      const { data: after } = await adminClient
        .from('person')
        .select('primary_photo_id')
        .eq('id', person.id)
        .single();
      expect(after!.primary_photo_id).toBeNull();
    });

    it('[正常系] 複数の person が同じ photo を参照している場合、photo 削除で全員の primary_photo_id が NULL になる', async () => {
      const { tree } = await setupOwnerAndTree('on-delete-multi');

      const photo = await createPhoto(tree.id);

      // 2人の person が同じ photo を参照
      const { data: person1 } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: '人物1', primary_photo_id: photo.id })
        .select()
        .single();

      const { data: person2 } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: '人物2', primary_photo_id: photo.id })
        .select()
        .single();

      // photo を削除
      await adminClient.from('photo').delete().eq('id', photo.id);

      // 両方の person.primary_photo_id が NULL に更新されていることを確認
      const { data: after1 } = await adminClient
        .from('person')
        .select('primary_photo_id')
        .eq('id', person1!.id)
        .single();

      const { data: after2 } = await adminClient
        .from('person')
        .select('primary_photo_id')
        .eq('id', person2!.id)
        .single();

      expect(after1!.primary_photo_id).toBeNull();
      expect(after2!.primary_photo_id).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: FK 違反
  // ---------------------------------------------------------------------------
  describe('FK 違反: 存在しない photo_id', () => {
    it('[異常系] 存在しない photo_id を primary_photo_id に設定すると FK 違反（23503）', async () => {
      const { tree } = await setupOwnerAndTree('fk-violation');

      const nonExistentPhotoId = '00000000-0000-0000-0000-000000000000';

      const { error } = await adminClient
        .from('person')
        .insert({
          tree_id: tree.id,
          display_name: 'FK 違反テスト',
          primary_photo_id: nonExistentPhotoId,
        });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23503'); // foreign_key_violation
    });

    it('[異常系] UPDATE で存在しない photo_id を primary_photo_id に設定すると FK 違反（23503）', async () => {
      const { tree } = await setupOwnerAndTree('fk-violation-update');

      const person = await createPerson(tree.id, null);
      const nonExistentPhotoId = '00000000-0000-0000-0000-000000000001';

      const { error } = await adminClient
        .from('person')
        .update({ primary_photo_id: nonExistentPhotoId })
        .eq('id', person.id);

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23503'); // foreign_key_violation
    });
  });
});
