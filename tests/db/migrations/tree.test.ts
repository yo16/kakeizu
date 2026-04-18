/**
 * tree テーブルのマイグレーションテスト
 *
 * マイグレーションファイル: 20260418000006_create_tree.sql
 *
 * 前提: `supabase db reset` でマイグレーションと seed が適用済みであること
 *
 * テスト観点:
 * - [正常系] owner が自分の tree を INSERT / SELECT / UPDATE / DELETE 可能
 * - [正常系] updated_at が UPDATE 時に自動で更新される
 * - [異常系] 他人の tree は SELECT できない（空配列）
 * - [異常系] 他人の tree への UPDATE / DELETE は 0 rows affected
 * - [異常系] anon（未認証）は SELECT できない
 * - [異常系] title NOT NULL 違反（INSERT で NULL を入れるとエラー）
 * - [正常系] auth.users 削除で tree が CASCADE 削除
 */

import {
  adminClient,
  anonClient,
  createTestUser,
  createUserClient,
  deleteTestUser,
} from '../helpers/supabase-clients';

jest.setTimeout(30000);

describe('tree テーブル', () => {
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
  // 正常系: CRUD 操作
  // ---------------------------------------------------------------------------
  describe('CRUD: 自分の tree への操作', () => {
    it('[正常系] owner が自分の tree を INSERT できる', async () => {
      const email = `test-tree-insert-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('tree')
        .insert({ owner_user_id: userId, title: 'テスト家系図' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.title).toBe('テスト家系図');
      expect(data!.owner_user_id).toBe(userId);
    });

    it('[正常系] owner が自分の tree を SELECT できる', async () => {
      const email = `test-tree-select-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      // adminClient でデータを作成
      const { data: inserted } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userId, title: 'SELECT テスト' })
        .select()
        .single();

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('tree')
        .select('*')
        .eq('id', inserted!.id)
        .single();

      expect(error).toBeNull();
      expect(data!.id).toBe(inserted!.id);
      expect(data!.title).toBe('SELECT テスト');
    });

    it('[正常系] owner が自分の tree を UPDATE できる', async () => {
      const email = `test-tree-update-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const { data: inserted } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userId, title: '更新前タイトル' })
        .select()
        .single();

      const clientSelf = await createUserClient(email, 'Password123!');
      const { error } = await clientSelf
        .from('tree')
        .update({ title: '更新後タイトル' })
        .eq('id', inserted!.id);

      expect(error).toBeNull();

      const { data: after } = await adminClient
        .from('tree')
        .select('title')
        .eq('id', inserted!.id)
        .single();
      expect(after!.title).toBe('更新後タイトル');
    });

    it('[正常系] owner が自分の tree を DELETE できる', async () => {
      const email = `test-tree-delete-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const { data: inserted } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userId, title: '削除対象' })
        .select()
        .single();

      const clientSelf = await createUserClient(email, 'Password123!');
      const { error } = await clientSelf
        .from('tree')
        .delete()
        .eq('id', inserted!.id);

      expect(error).toBeNull();

      const { data: after } = await adminClient
        .from('tree')
        .select('id')
        .eq('id', inserted!.id);
      expect(after).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: updated_at 自動更新
  // ---------------------------------------------------------------------------
  describe('updated_at 自動更新トリガー', () => {
    it('[正常系] tree を UPDATE すると updated_at が現在時刻に更新される', async () => {
      const email = `test-tree-updated-at-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const { data: inserted } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userId, title: 'updated_at テスト' })
        .select()
        .single();

      const beforeUpdatedAt = inserted!.updated_at;

      // 時刻差を確保するために待機
      await new Promise((resolve) => setTimeout(resolve, 100));

      await adminClient
        .from('tree')
        .update({ title: 'updated_at 更新後' })
        .eq('id', inserted!.id);

      const { data: after } = await adminClient
        .from('tree')
        .select('updated_at')
        .eq('id', inserted!.id)
        .single();

      expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
        new Date(beforeUpdatedAt).getTime()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: RLS - 他人の tree へのアクセス制御
  // ---------------------------------------------------------------------------
  describe('RLS: 他人の tree へのアクセス制御', () => {
    it('[異常系] 他人の tree は SELECT できない（空配列）', async () => {
      const emailA = `test-tree-rls-a-${Date.now()}@example.com`;
      const userIdA = await createTestUser(emailA, 'Password123!');
      createdUserIds.push(userIdA);

      const emailB = `test-tree-rls-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      // ユーザーA の tree を作成
      const { data: treeA } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userIdA, title: 'ユーザーAの家系図' })
        .select()
        .single();

      // ユーザーB として ユーザーA の tree を SELECT
      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('tree')
        .select('*')
        .eq('id', treeA!.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[異常系] 他人の tree への UPDATE は 0 rows affected', async () => {
      const emailA = `test-tree-rls-update-a-${Date.now()}@example.com`;
      const userIdA = await createTestUser(emailA, 'Password123!');
      createdUserIds.push(userIdA);

      const emailB = `test-tree-rls-update-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const { data: treeA } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userIdA, title: '変更されない家系図' })
        .select()
        .single();

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('tree')
        .update({ title: '不正な変更' })
        .eq('id', treeA!.id)
        .select();

      // RLS により 0 rows affected（エラーではない）
      expect(error).toBeNull();
      expect(data).toHaveLength(0);

      // 実際に変更されていないことを確認
      const { data: check } = await adminClient
        .from('tree')
        .select('title')
        .eq('id', treeA!.id)
        .single();
      expect(check!.title).toBe('変更されない家系図');
    });

    it('[異常系] 他人の tree への DELETE は 0 rows affected', async () => {
      const emailA = `test-tree-rls-delete-a-${Date.now()}@example.com`;
      const userIdA = await createTestUser(emailA, 'Password123!');
      createdUserIds.push(userIdA);

      const emailB = `test-tree-rls-delete-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const { data: treeA } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userIdA, title: '削除されない家系図' })
        .select()
        .single();

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('tree')
        .delete()
        .eq('id', treeA!.id)
        .select();

      // RLS により 0 rows affected（エラーではない）
      expect(error).toBeNull();
      expect(data).toHaveLength(0);

      // 実際に削除されていないことを確認
      const { data: check } = await adminClient
        .from('tree')
        .select('id')
        .eq('id', treeA!.id);
      expect(check).toHaveLength(1);
    });

    it('[異常系] anon ユーザーは tree を SELECT できない', async () => {
      const email = `test-tree-anon-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const { data: tree } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userId, title: '未認証からは見えない' })
        .select()
        .single();

      const { data, error } = await anonClient
        .from('tree')
        .select('*')
        .eq('id', tree!.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: NOT NULL 制約
  // ---------------------------------------------------------------------------
  describe('NOT NULL 制約', () => {
    it('[異常系] title が NULL の場合 INSERT に失敗する', async () => {
      const email = `test-tree-null-title-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { error } = await clientSelf
        .from('tree')
        .insert({ owner_user_id: userId, title: null });

      expect(error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: CASCADE 削除
  // ---------------------------------------------------------------------------
  describe('CASCADE 削除', () => {
    it('[正常系] auth.users を削除すると tree も CASCADE 削除される', async () => {
      const email = `test-tree-cascade-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      // 後処理リストには追加しない（このテスト内で削除する）

      const { data: tree } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userId, title: 'CASCADE 削除テスト' })
        .select()
        .single();

      // tree が存在することを確認
      const { data: before } = await adminClient
        .from('tree')
        .select('id')
        .eq('id', tree!.id);
      expect(before).toHaveLength(1);

      // auth.users を削除
      await deleteTestUser(userId);

      // tree も削除されていることを確認
      const { data: after } = await adminClient
        .from('tree')
        .select('id')
        .eq('id', tree!.id);
      expect(after).toHaveLength(0);
    });
  });
});
