/**
 * profile テーブルのマイグレーションテスト
 *
 * マイグレーションファイル: 20260418000001_create_profile.sql
 * トリガーファイル: 20260418000005_create_signup_trigger.sql
 *
 * 前提: `supabase db reset` でマイグレーションと seed が適用済みであること
 *
 * テスト観点:
 * - [正常系] auth.users へのINSERT後、profile が自動作成される
 * - [正常系] updated_at が更新時に自動で現在時刻になる
 * - [異常系] 他人の profile を SELECT できない（RLSテスト）
 * - [異常系] 他人の profile を UPDATE できない（RLSテスト）
 * - [異常系] auth.users の DELETE で profile が CASCADE 削除される
 * - [異常系] anon ユーザーは profile を SELECT できない
 */

import {
  adminClient,
  anonClient,
  createTestUser,
  createUserClient,
  deleteTestUser,
} from '../helpers/supabase-clients';

// タイムアウトを延長（DB操作のため）
jest.setTimeout(30000);

describe('profile テーブル', () => {
  // テストユーザーの管理
  const createdUserIds: string[] = [];

  afterEach(async () => {
    // テストごとに作成したユーザーをクリーンアップ（CASCADE で profile / subscription も削除）
    for (const userId of createdUserIds) {
      await deleteTestUser(userId).catch(() => {
        // 既に削除済みの場合は無視
      });
    }
    createdUserIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // 正常系: auth.users へのINSERT後、profile が自動作成される
  // ---------------------------------------------------------------------------
  describe('トリガーによる profile 自動作成', () => {
    it('[正常系] auth.users に INSERT すると profile が自動作成される', async () => {
      const email = `test-profile-autocreate-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const { data, error } = await adminClient
        .from('profile')
        .select('*')
        .eq('user_id', userId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.user_id).toBe(userId);
    });

    it('[正常系] created_at と updated_at が設定されている', async () => {
      const email = `test-profile-timestamps-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const { data, error } = await adminClient
        .from('profile')
        .select('created_at, updated_at')
        .eq('user_id', userId)
        .single();

      expect(error).toBeNull();
      expect(data!.created_at).not.toBeNull();
      expect(data!.updated_at).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: updated_at が更新時に自動更新される
  // ---------------------------------------------------------------------------
  describe('updated_at 自動更新トリガー', () => {
    it('[正常系] profile を UPDATE すると updated_at が現在時刻に更新される', async () => {
      const email = `test-profile-updated-at-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      // 初期の updated_at を記録
      const { data: before } = await adminClient
        .from('profile')
        .select('updated_at')
        .eq('user_id', userId)
        .single();

      // 1ミリ秒待って更新時刻との差を確保
      await new Promise((resolve) => setTimeout(resolve, 100));

      // display_name を更新
      const { error: updateError } = await adminClient
        .from('profile')
        .update({ display_name: '更新後の名前' })
        .eq('user_id', userId);

      expect(updateError).toBeNull();

      const { data: after } = await adminClient
        .from('profile')
        .select('updated_at')
        .eq('user_id', userId)
        .single();

      // updated_at が変わっていることを確認
      expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
        new Date(before!.updated_at).getTime()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: RLS - 他人の profile を参照・更新できない
  // ---------------------------------------------------------------------------
  describe('RLS: 他人の profile への アクセス制御', () => {
    it('[異常系] 別ユーザーとして認証済みの場合、他人の profile を SELECT できない', async () => {
      // ユーザーA を作成
      const emailA = `test-rls-a-${Date.now()}@example.com`;
      const userIdA = await createTestUser(emailA, 'Password123!');
      createdUserIds.push(userIdA);

      // ユーザーB を作成
      const emailB = `test-rls-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      // ユーザーB のクライアントでユーザーA の profile を SELECT
      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('profile')
        .select('*')
        .eq('user_id', userIdA);

      // RLS により 0 件が返る（エラーではなく空配列）
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[異常系] 別ユーザーとして認証済みの場合、他人の profile を UPDATE できない', async () => {
      // ユーザーA を作成
      const emailA = `test-rls-update-a-${Date.now()}@example.com`;
      const userIdA = await createTestUser(emailA, 'Password123!');
      createdUserIds.push(userIdA);

      // ユーザーB を作成
      const emailB = `test-rls-update-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      // ユーザーB のクライアントでユーザーA の profile を UPDATE
      const clientB = await createUserClient(emailB, 'Password123!');
      const { error, count } = await clientB
        .from('profile')
        .update({ display_name: '不正な変更' })
        .eq('user_id', userIdA)
        .select();

      // RLS により 0 件が更新される（エラーではなく影響行数 0）
      expect(error).toBeNull();
      // Supabase の RLS により対象行が見えないため更新が適用されない
      const { data: checkData } = await adminClient
        .from('profile')
        .select('display_name')
        .eq('user_id', userIdA)
        .single();
      expect(checkData!.display_name).not.toBe('不正な変更');
    });

    it('[異常系] anon ユーザーは profile を SELECT できない', async () => {
      const email = `test-rls-anon-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const { data, error } = await anonClient
        .from('profile')
        .select('*')
        .eq('user_id', userId);

      // RLS により 0 件が返る
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[正常系] 自分の profile は SELECT できる', async () => {
      const email = `test-rls-self-select-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('profile')
        .select('*')
        .eq('user_id', userId)
        .single();

      expect(error).toBeNull();
      expect(data!.user_id).toBe(userId);
    });

    it('[正常系] 自分の profile は UPDATE できる', async () => {
      const email = `test-rls-self-update-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { error } = await clientSelf
        .from('profile')
        .update({ display_name: '自分で変更した名前' })
        .eq('user_id', userId);

      expect(error).toBeNull();

      // 変更が反映されていることを確認
      const { data } = await adminClient
        .from('profile')
        .select('display_name')
        .eq('user_id', userId)
        .single();
      expect(data!.display_name).toBe('自分で変更した名前');
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: auth.users の DELETE で profile が CASCADE 削除される
  // ---------------------------------------------------------------------------
  describe('CASCADE 削除', () => {
    it('[異常系] auth.users を削除すると profile も CASCADE 削除される', async () => {
      const email = `test-cascade-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      // 後処理リストには追加しない（このテスト内で削除する）

      // profile が存在することを確認
      const { data: before } = await adminClient
        .from('profile')
        .select('*')
        .eq('user_id', userId);
      expect(before).toHaveLength(1);

      // auth.users を削除
      await deleteTestUser(userId);

      // profile も削除されていることを確認
      const { data: after } = await adminClient
        .from('profile')
        .select('*')
        .eq('user_id', userId);
      expect(after).toHaveLength(0);
    });
  });
});
