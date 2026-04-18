/**
 * keepalive_ping テーブルのマイグレーションテスト
 *
 * マイグレーションファイル: 20260418000013_create_keepalive_ping.sql
 *
 * テスト観点:
 * - [正常系] adminClient（service_role）で INSERT 成功
 * - [正常系] adminClient で SELECT 可能
 * - [正常系] pinged_at が INSERT 時に自動設定される
 * - [正常系] source のデフォルト値が 'github-actions'
 * - [異常系] authenticated ユーザーでは INSERT 失敗（0 rows / error）
 * - [異常系] authenticated ユーザーでは SELECT が空配列
 * - [異常系] anon でも INSERT 失敗
 * - [異常系] anon でも SELECT が空配列
 */

import {
  adminClient,
  anonClient,
  createTestUser,
  createUserClient,
  deleteTestUser,
} from '../helpers/supabase-clients';

jest.setTimeout(30000);

describe('keepalive_ping テーブル', () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    for (const userId of createdUserIds) {
      await deleteTestUser(userId).catch(() => {
        // 既に削除済みの場合は無視
      });
    }
    createdUserIds.length = 0;

    // テスト中に挿入した keepalive_ping レコードをクリーンアップ
    await adminClient.from('keepalive_ping').delete().neq('id', 0);
  });

  // ---------------------------------------------------------------------------
  // 正常系: Service Role（adminClient）による操作
  // ---------------------------------------------------------------------------
  describe('Service Role: adminClient による操作', () => {
    it('[正常系] adminClient（service_role）で keepalive_ping を INSERT できる', async () => {
      const { data, error } = await adminClient
        .from('keepalive_ping')
        .insert({ source: 'test' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.id).toBeDefined();
    });

    it('[正常系] adminClient で keepalive_ping を SELECT できる', async () => {
      const { data: inserted } = await adminClient
        .from('keepalive_ping')
        .insert({ source: 'test-select' })
        .select()
        .single();

      const { data, error } = await adminClient
        .from('keepalive_ping')
        .select('*')
        .eq('id', inserted!.id)
        .single();

      expect(error).toBeNull();
      expect(data!.id).toBe(inserted!.id);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: デフォルト値
  // ---------------------------------------------------------------------------
  describe('デフォルト値', () => {
    it('[正常系] pinged_at が INSERT 時に自動設定される', async () => {
      const beforeInsert = new Date();

      const { data, error } = await adminClient
        .from('keepalive_ping')
        .insert({ source: 'test-pinged-at' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.pinged_at).toBeDefined();
      expect(new Date(data!.pinged_at).getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime() - 1000);
    });

    it("[正常系] source のデフォルト値は 'github-actions'", async () => {
      const { data, error } = await adminClient
        .from('keepalive_ping')
        .insert({})
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.source).toBe('github-actions');
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: authenticated ユーザーは INSERT / SELECT 不可
  // ---------------------------------------------------------------------------
  describe('RLS: authenticated ユーザーのアクセス拒否', () => {
    it('[異常系] authenticated ユーザーは keepalive_ping を INSERT できない', async () => {
      const email = `test-kp-auth-insert-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const clientUser = await createUserClient(email, 'Password123!');
      const { data, error } = await clientUser
        .from('keepalive_ping')
        .insert({ source: 'test' })
        .select();

      // RLS ポリシーが定義されていないため INSERT は拒否される
      // エラーになるか、data が空になるかのいずれか
      const isBlocked = error !== null || (data !== null && data.length === 0);
      expect(isBlocked).toBe(true);
    });

    it('[異常系] authenticated ユーザーは keepalive_ping を SELECT できない（空配列）', async () => {
      // 先に adminClient でデータを挿入
      await adminClient.from('keepalive_ping').insert({ source: 'test-auth-select' });

      const email = `test-kp-auth-select-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const clientUser = await createUserClient(email, 'Password123!');
      const { data, error } = await clientUser
        .from('keepalive_ping')
        .select('*');

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: anon ユーザーは INSERT / SELECT 不可
  // ---------------------------------------------------------------------------
  describe('RLS: anon ユーザーのアクセス拒否', () => {
    it('[異常系] anon ユーザーは keepalive_ping を INSERT できない', async () => {
      const { data, error } = await anonClient
        .from('keepalive_ping')
        .insert({ source: 'anon-test' })
        .select();

      // RLS ポリシーが定義されていないため INSERT は拒否される
      const isBlocked = error !== null || (data !== null && data.length === 0);
      expect(isBlocked).toBe(true);
    });

    it('[異常系] anon ユーザーは keepalive_ping を SELECT できない（空配列）', async () => {
      // 先に adminClient でデータを挿入
      await adminClient.from('keepalive_ping').insert({ source: 'test-anon-select' });

      const { data, error } = await anonClient
        .from('keepalive_ping')
        .select('*');

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });
});
