/**
 * photo テーブルのマイグレーションテスト
 *
 * マイグレーションファイル: 20260418000009_create_photo.sql
 *
 * テスト観点:
 * - [正常系] tree owner が自分の tree 配下に photo を INSERT / SELECT / UPDATE / DELETE 可能
 * - [正常系] updated_at 自動更新トリガー
 * - [正常系] mime_type に image/jpeg / image/png / image/webp で成功
 * - [異常系] mime_type に許可外の値で INSERT 失敗
 * - [正常系] taken_year 境界値（1000 / 9999）で成功
 * - [異常系] taken_year が範囲外（999 / 10000）で失敗
 * - [正常系] taken_year が NULL の場合は CHECK 影響なし
 * - [正常系] taken_month 境界値（1 / 12）で成功
 * - [異常系] taken_month が範囲外（0 / 13）で失敗
 * - [正常系] taken_month が NULL の場合は CHECK 影響なし
 * - [正常系] taken_day 境界値（1 / 31）で成功
 * - [異常系] taken_day が範囲外（0 / 32）で失敗
 * - [正常系] taken_day が NULL の場合は CHECK 影響なし
 * - [異常系] storage_object_key が NULL で INSERT 失敗（23502）
 * - [異常系] mime_type が NULL で INSERT 失敗（23502）
 * - [異常系] anon は photo を SELECT できない
 * - [異常系] 他人の tree 配下の photo は SELECT できない
 * - [異常系] 他人の tree_id を指定して photo を INSERT できない
 * - [異常系] 他人の photo への UPDATE は data=[] + adminClient で未変更確認
 * - [異常系] 他人の photo への DELETE は data=[] + adminClient で存在確認
 * - [正常系] tree 削除で photo が CASCADE 削除
 * - [正常系] auth.users 削除で photo が CASCADE 削除（tree 経由）
 */

import {
  adminClient,
  anonClient,
  createTestUser,
  createUserClient,
  deleteTestUser,
} from '../helpers/supabase-clients';

jest.setTimeout(30000);

describe('photo テーブル', () => {
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
    const email = `test-photo-${suffix}-${Date.now()}@example.com`;
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
  async function createPhoto(treeId: string, overrides: Record<string, unknown> = {}) {
    const { data: photo } = await adminClient
      .from('photo')
      .insert({
        tree_id: treeId,
        storage_object_key: `photos/${Date.now()}.jpg`,
        mime_type: 'image/jpeg',
        ...overrides,
      })
      .select()
      .single();
    return photo!;
  }

  // ---------------------------------------------------------------------------
  // 正常系: CRUD 操作
  // ---------------------------------------------------------------------------
  describe('CRUD: 自分の tree 配下への操作', () => {
    it('[正常系] tree owner が photo を INSERT できる', async () => {
      const { email, tree } = await setupOwnerAndTree('insert');

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('photo')
        .insert({
          tree_id: tree.id,
          storage_object_key: 'photos/test.jpg',
          mime_type: 'image/jpeg',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.tree_id).toBe(tree.id);
      expect(data!.mime_type).toBe('image/jpeg');
    });

    it('[正常系] tree owner が photo を SELECT できる', async () => {
      const { email, tree } = await setupOwnerAndTree('select');

      const photo = await createPhoto(tree.id);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('photo')
        .select('*')
        .eq('id', photo.id)
        .single();

      expect(error).toBeNull();
      expect(data!.id).toBe(photo.id);
    });

    it('[正常系] tree owner が photo を UPDATE できる', async () => {
      const { email, tree } = await setupOwnerAndTree('update');

      const photo = await createPhoto(tree.id);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { error } = await clientSelf
        .from('photo')
        .update({ caption: '更新後のキャプション' })
        .eq('id', photo.id);

      expect(error).toBeNull();

      const { data: after } = await adminClient
        .from('photo')
        .select('caption')
        .eq('id', photo.id)
        .single();
      expect(after!.caption).toBe('更新後のキャプション');
    });

    it('[正常系] tree owner が photo を DELETE できる', async () => {
      const { email, tree } = await setupOwnerAndTree('delete');

      const photo = await createPhoto(tree.id);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('photo')
        .delete()
        .eq('id', photo.id)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(1);

      const { data: after } = await adminClient
        .from('photo')
        .select('id')
        .eq('id', photo.id);
      expect(after).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: updated_at 自動更新
  // ---------------------------------------------------------------------------
  describe('updated_at 自動更新トリガー', () => {
    it('[正常系] photo を UPDATE すると updated_at が現在時刻に更新される', async () => {
      const { tree } = await setupOwnerAndTree('updated-at');

      const photo = await createPhoto(tree.id);
      const beforeUpdatedAt = photo.updated_at;

      await new Promise((resolve) => setTimeout(resolve, 100));

      await adminClient
        .from('photo')
        .update({ caption: 'updated_at テスト' })
        .eq('id', photo.id);

      const { data: after } = await adminClient
        .from('photo')
        .select('updated_at')
        .eq('id', photo.id)
        .single();

      expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
        new Date(beforeUpdatedAt).getTime()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系・異常系: mime_type CHECK 制約
  // ---------------------------------------------------------------------------
  describe('mime_type CHECK 制約', () => {
    it('[正常系] mime_type に image/jpeg を指定して INSERT できる', async () => {
      const { tree } = await setupOwnerAndTree('mime-jpeg');

      const { data, error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.mime_type).toBe('image/jpeg');
    });

    it('[正常系] mime_type に image/png を指定して INSERT できる', async () => {
      const { tree } = await setupOwnerAndTree('mime-png');

      const { data, error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.png', mime_type: 'image/png' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.mime_type).toBe('image/png');
    });

    it('[正常系] mime_type に image/webp を指定して INSERT できる', async () => {
      const { tree } = await setupOwnerAndTree('mime-webp');

      const { data, error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.webp', mime_type: 'image/webp' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.mime_type).toBe('image/webp');
    });

    it('[異常系] mime_type に image/gif（許可外）を指定すると INSERT に失敗する', async () => {
      const { tree } = await setupOwnerAndTree('mime-gif');

      const { error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.gif', mime_type: 'image/gif' });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514'); // check_violation
    });

    it('[異常系] mime_type に text/plain（許可外）を指定すると INSERT に失敗する', async () => {
      const { tree } = await setupOwnerAndTree('mime-text');

      const { error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.txt', mime_type: 'text/plain' });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514'); // check_violation
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系・異常系: taken_year CHECK 制約
  // ---------------------------------------------------------------------------
  describe('taken_year CHECK 制約', () => {
    it('[正常系] taken_year が 1000（有効下限）で INSERT できる', async () => {
      const { tree } = await setupOwnerAndTree('taken-year-min');

      const { data, error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_year: 1000 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.taken_year).toBe(1000);
    });

    it('[正常系] taken_year が 9999（有効上限）で INSERT できる', async () => {
      const { tree } = await setupOwnerAndTree('taken-year-max');

      const { data, error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_year: 9999 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.taken_year).toBe(9999);
    });

    it('[異常系] taken_year が 999（範囲外下限）で INSERT に失敗する', async () => {
      const { tree } = await setupOwnerAndTree('taken-year-low');

      const { error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_year: 999 });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514'); // check_violation
    });

    it('[異常系] taken_year が 10000（範囲外上限）で INSERT に失敗する', async () => {
      const { tree } = await setupOwnerAndTree('taken-year-high');

      const { error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_year: 10000 });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514'); // check_violation
    });

    it('[正常系] taken_year が NULL の場合は CHECK の影響を受けない', async () => {
      const { tree } = await setupOwnerAndTree('taken-year-null');

      const { data, error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_year: null })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.taken_year).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系・異常系: taken_month CHECK 制約
  // ---------------------------------------------------------------------------
  describe('taken_month CHECK 制約', () => {
    it('[正常系] taken_month が 1（有効下限）で INSERT できる', async () => {
      const { tree } = await setupOwnerAndTree('taken-month-min');

      const { data, error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_month: 1 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.taken_month).toBe(1);
    });

    it('[正常系] taken_month が 12（有効上限）で INSERT できる', async () => {
      const { tree } = await setupOwnerAndTree('taken-month-max');

      const { data, error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_month: 12 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.taken_month).toBe(12);
    });

    it('[異常系] taken_month が 0（範囲外下限）で INSERT に失敗する', async () => {
      const { tree } = await setupOwnerAndTree('taken-month-0');

      const { error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_month: 0 });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514'); // check_violation
    });

    it('[異常系] taken_month が 13（範囲外上限）で INSERT に失敗する', async () => {
      const { tree } = await setupOwnerAndTree('taken-month-13');

      const { error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_month: 13 });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514'); // check_violation
    });

    it('[正常系] taken_month が NULL の場合は CHECK の影響を受けない', async () => {
      const { tree } = await setupOwnerAndTree('taken-month-null');

      const { data, error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_month: null })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.taken_month).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系・異常系: taken_day CHECK 制約
  // ---------------------------------------------------------------------------
  describe('taken_day CHECK 制約', () => {
    it('[正常系] taken_day が 1（有効下限）で INSERT できる', async () => {
      const { tree } = await setupOwnerAndTree('taken-day-min');

      const { data, error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_day: 1 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.taken_day).toBe(1);
    });

    it('[正常系] taken_day が 31（有効上限）で INSERT できる', async () => {
      const { tree } = await setupOwnerAndTree('taken-day-max');

      const { data, error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_day: 31 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.taken_day).toBe(31);
    });

    it('[異常系] taken_day が 0（範囲外下限）で INSERT に失敗する', async () => {
      const { tree } = await setupOwnerAndTree('taken-day-0');

      const { error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_day: 0 });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514'); // check_violation
    });

    it('[異常系] taken_day が 32（範囲外上限）で INSERT に失敗する', async () => {
      const { tree } = await setupOwnerAndTree('taken-day-32');

      const { error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_day: 32 });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514'); // check_violation
    });

    it('[正常系] taken_day が NULL の場合は CHECK の影響を受けない', async () => {
      const { tree } = await setupOwnerAndTree('taken-day-null');

      const { data, error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: 'image/jpeg', taken_day: null })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.taken_day).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: NOT NULL 制約
  // ---------------------------------------------------------------------------
  describe('NOT NULL 制約', () => {
    it('[異常系] storage_object_key が NULL で INSERT に失敗する（23502）', async () => {
      const { tree } = await setupOwnerAndTree('key-null');

      const { error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: null, mime_type: 'image/jpeg' });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23502'); // not_null_violation
    });

    it('[異常系] mime_type が NULL で INSERT に失敗する（23502）', async () => {
      const { tree } = await setupOwnerAndTree('mime-null');

      const { error } = await adminClient
        .from('photo')
        .insert({ tree_id: tree.id, storage_object_key: 'test.jpg', mime_type: null });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23502'); // not_null_violation
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: RLS - 他人の tree 配下の photo へのアクセス制御
  // ---------------------------------------------------------------------------
  describe('RLS: アクセス制御', () => {
    it('[異常系] anon ユーザーは photo を SELECT できない', async () => {
      const { tree } = await setupOwnerAndTree('rls-anon');

      const photo = await createPhoto(tree.id);

      const { data, error } = await anonClient
        .from('photo')
        .select('*')
        .eq('id', photo.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[異常系] 他人の tree 配下の photo は SELECT できない', async () => {
      const { tree: treeA } = await setupOwnerAndTree('rls-select-a');

      const emailB = `test-photo-rls-select-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const photo = await createPhoto(treeA.id);

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('photo')
        .select('*')
        .eq('id', photo.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[異常系] 他人の tree_id を指定して photo を INSERT できない', async () => {
      const { tree: treeA } = await setupOwnerAndTree('rls-insert-a');

      const emailB = `test-photo-rls-insert-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const clientB = await createUserClient(emailB, 'Password123!');
      const { error } = await clientB
        .from('photo')
        .insert({
          tree_id: treeA.id,
          storage_object_key: 'malicious.jpg',
          mime_type: 'image/jpeg',
        });

      expect(error).not.toBeNull();
    });

    it('[異常系] 他人の photo への UPDATE は 0 rows affected + adminClient で未変更確認', async () => {
      const { tree: treeA } = await setupOwnerAndTree('rls-update-a');

      const emailB = `test-photo-rls-update-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const photo = await createPhoto(treeA.id, { caption: '元のキャプション' });

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('photo')
        .update({ caption: '不正な変更' })
        .eq('id', photo.id)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(0);

      const { data: check } = await adminClient
        .from('photo')
        .select('caption')
        .eq('id', photo.id)
        .single();
      expect(check!.caption).toBe('元のキャプション');
    });

    it('[異常系] 他人の photo への DELETE は 0 rows affected + adminClient で存在確認', async () => {
      const { tree: treeA } = await setupOwnerAndTree('rls-delete-a');

      const emailB = `test-photo-rls-delete-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const photo = await createPhoto(treeA.id);

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('photo')
        .delete()
        .eq('id', photo.id)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(0);

      const { data: check } = await adminClient
        .from('photo')
        .select('id')
        .eq('id', photo.id);
      expect(check).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: インデックス確認（複数 tree で絞り込み）
  // ---------------------------------------------------------------------------
  describe('インデックス: tree_id による絞り込み', () => {
    it('[正常系] 複数の tree が存在する場合、自分の tree の photo のみ取得できる', async () => {
      const { email: emailA, tree: treeA } = await setupOwnerAndTree('idx-a');

      const emailB = `test-photo-idx-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const { data: treeB } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userIdB, title: 'ユーザーBの家系図' })
        .select()
        .single();

      await createPhoto(treeA.id, { caption: 'ユーザーAの写真' });
      await createPhoto(treeB!.id, { caption: 'ユーザーBの写真' });

      const clientA = await createUserClient(emailA, 'Password123!');
      const { data, error } = await clientA
        .from('photo')
        .select('*');

      expect(error).toBeNull();
      // ユーザーA は自分の tree の photo のみ見える
      const allBelongToA = data!.every((p: { tree_id: string }) => p.tree_id === treeA.id);
      expect(allBelongToA).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: CASCADE 削除
  // ---------------------------------------------------------------------------
  describe('CASCADE 削除', () => {
    it('[正常系] tree を削除すると photo も CASCADE 削除される', async () => {
      const { tree } = await setupOwnerAndTree('cascade-tree');

      const photo = await createPhoto(tree.id);

      await adminClient.from('tree').delete().eq('id', tree.id);

      const { data: after } = await adminClient
        .from('photo')
        .select('id')
        .eq('id', photo.id);
      expect(after).toHaveLength(0);
    });

    it('[正常系] auth.users を削除すると photo も CASCADE 削除される（tree 経由）', async () => {
      const email = `test-photo-cascade-user-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      // 後処理リストには追加しない（このテスト内で削除する）

      const { data: tree } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userId, title: 'CASCADE ユーザー削除テスト' })
        .select()
        .single();

      const photo = await createPhoto(tree!.id);

      await deleteTestUser(userId);

      const { data: after } = await adminClient
        .from('photo')
        .select('id')
        .eq('id', photo.id);
      expect(after).toHaveLength(0);
    });
  });
});
