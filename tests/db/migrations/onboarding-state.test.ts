/**
 * onboarding_state テーブルのマイグレーションテスト
 *
 * マイグレーションファイル: 20260418000012_create_onboarding_state.sql
 *
 * テスト観点:
 * - [正常系] 本人が自分の onboarding_state を INSERT / SELECT / UPDATE 可能
 * - [正常系] updated_at 自動更新トリガー
 * - [正常系] is_completed デフォルト false
 * - [異常系] current_step が NULL で INSERT 失敗（23502）
 * - [正常系] tree_id は NULL 許容
 * - [異常系] 他人の onboarding_state は SELECT できない
 * - [異常系] anon は SELECT できない
 * - [異常系] 他人の user_id で INSERT 失敗（WITH CHECK）
 * - [異常系] 他人の onboarding_state への UPDATE は data=[]
 * - [異常系] 本人でも DELETE できない（ポリシー未定義）
 *   → data=[] + adminClient で行が残っていることを確認
 * - [正常系] auth.users 削除で onboarding_state が CASCADE 削除
 * - [正常系] tree 削除で onboarding_state.tree_id が NULL に更新される（ON DELETE SET NULL）
 */

import {
  adminClient,
  anonClient,
  createTestUser,
  createUserClient,
  deleteTestUser,
} from '../helpers/supabase-clients';

jest.setTimeout(30000);

describe('onboarding_state テーブル', () => {
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
  // ヘルパー: テストユーザーを作成して返す
  // ---------------------------------------------------------------------------
  async function setupUser(suffix: string) {
    const email = `test-obs-${suffix}-${Date.now()}@example.com`;
    const userId = await createTestUser(email, 'Password123!');
    createdUserIds.push(userId);
    return { email, userId };
  }

  // ---------------------------------------------------------------------------
  // ヘルパー: onboarding_state を adminClient で作成して返す
  // ---------------------------------------------------------------------------
  async function createOnboardingState(userId: string, treeId?: string) {
    const { data } = await adminClient
      .from('onboarding_state')
      .insert({
        user_id: userId,
        current_step: 'welcome',
        tree_id: treeId ?? null,
      })
      .select()
      .single();
    return data!;
  }

  // ---------------------------------------------------------------------------
  // 正常系: CRUD 操作（本人）
  // ---------------------------------------------------------------------------
  describe('CRUD: 本人による操作', () => {
    it('[正常系] 本人が自分の onboarding_state を INSERT できる', async () => {
      const { email, userId } = await setupUser('insert');

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('onboarding_state')
        .insert({ user_id: userId, current_step: 'welcome' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.user_id).toBe(userId);
      expect(data!.current_step).toBe('welcome');
    });

    it('[正常系] 本人が自分の onboarding_state を SELECT できる', async () => {
      const { email, userId } = await setupUser('select');

      await createOnboardingState(userId);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('onboarding_state')
        .select('*')
        .eq('user_id', userId)
        .single();

      expect(error).toBeNull();
      expect(data!.user_id).toBe(userId);
    });

    it('[正常系] 本人が自分の onboarding_state を UPDATE できる', async () => {
      const { email, userId } = await setupUser('update');

      await createOnboardingState(userId);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { error } = await clientSelf
        .from('onboarding_state')
        .update({ current_step: 'profile', is_completed: true })
        .eq('user_id', userId);

      expect(error).toBeNull();

      const { data: after } = await adminClient
        .from('onboarding_state')
        .select('current_step, is_completed')
        .eq('user_id', userId)
        .single();
      expect(after!.current_step).toBe('profile');
      expect(after!.is_completed).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: updated_at 自動更新
  // ---------------------------------------------------------------------------
  describe('updated_at 自動更新トリガー', () => {
    it('[正常系] onboarding_state を UPDATE すると updated_at が現在時刻に更新される', async () => {
      const { userId } = await setupUser('updated-at');

      const state = await createOnboardingState(userId);
      const beforeUpdatedAt = state.updated_at;

      await new Promise((resolve) => setTimeout(resolve, 100));

      await adminClient
        .from('onboarding_state')
        .update({ current_step: 'next' })
        .eq('user_id', userId);

      const { data: after } = await adminClient
        .from('onboarding_state')
        .select('updated_at')
        .eq('user_id', userId)
        .single();

      expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
        new Date(beforeUpdatedAt).getTime()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: デフォルト値・NULL 許容
  // ---------------------------------------------------------------------------
  describe('デフォルト値・NULL 許容', () => {
    it('[正常系] is_completed のデフォルト値は false', async () => {
      const { userId } = await setupUser('is-completed-default');

      const state = await createOnboardingState(userId);

      expect(state.is_completed).toBe(false);
    });

    it('[正常系] tree_id は NULL 許容', async () => {
      const { userId } = await setupUser('tree-id-null');

      const state = await createOnboardingState(userId, undefined);

      expect(state.tree_id).toBeNull();
    });

    it('[正常系] tree_id に有効な tree を設定できる', async () => {
      const { userId } = await setupUser('tree-id-set');

      const { data: tree } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userId, title: 'テスト家系図' })
        .select()
        .single();

      const state = await createOnboardingState(userId, tree!.id);

      expect(state.tree_id).toBe(tree!.id);
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: NOT NULL 制約
  // ---------------------------------------------------------------------------
  describe('NOT NULL 制約', () => {
    it('[異常系] current_step が NULL で INSERT に失敗する（23502）', async () => {
      const { userId } = await setupUser('current-step-null');

      const { error } = await adminClient
        .from('onboarding_state')
        .insert({ user_id: userId, current_step: null });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23502'); // not_null_violation
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: RLS - アクセス制御
  // ---------------------------------------------------------------------------
  describe('RLS: アクセス制御', () => {
    it('[異常系] anon ユーザーは onboarding_state を SELECT できない', async () => {
      const { userId } = await setupUser('rls-anon');

      await createOnboardingState(userId);

      const { data, error } = await anonClient
        .from('onboarding_state')
        .select('*')
        .eq('user_id', userId);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[異常系] 他人の onboarding_state は SELECT できない', async () => {
      const { userId: userIdA } = await setupUser('rls-select-a');

      const emailB = `test-obs-rls-select-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      await createOnboardingState(userIdA);

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('onboarding_state')
        .select('*')
        .eq('user_id', userIdA);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[異常系] 他人の user_id を指定して onboarding_state を INSERT できない（WITH CHECK）', async () => {
      const { userId: userIdA } = await setupUser('rls-insert-a');

      const emailB = `test-obs-rls-insert-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      // ユーザーB がユーザーA の user_id で INSERT を試みる
      const clientB = await createUserClient(emailB, 'Password123!');
      const { error } = await clientB
        .from('onboarding_state')
        .insert({ user_id: userIdA, current_step: 'welcome' });

      expect(error).not.toBeNull();
    });

    it('[異常系] 他人の onboarding_state への UPDATE は data=[]', async () => {
      const { userId: userIdA } = await setupUser('rls-update-a');

      const emailB = `test-obs-rls-update-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      await createOnboardingState(userIdA);

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('onboarding_state')
        .update({ current_step: '不正な変更' })
        .eq('user_id', userIdA)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(0);

      // adminClient で実際の値が変更されていないことを確認
      const { data: check } = await adminClient
        .from('onboarding_state')
        .select('current_step')
        .eq('user_id', userIdA)
        .single();
      expect(check!.current_step).toBe('welcome'); // 変更されていない
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: 本人でも DELETE できない（ポリシー未定義）
  // ---------------------------------------------------------------------------
  describe('DELETE 拒否（ポリシー未定義）', () => {
    it('[異常系] 本人でも onboarding_state を DELETE できない', async () => {
      const { email, userId } = await setupUser('delete-own');

      await createOnboardingState(userId);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('onboarding_state')
        .delete()
        .eq('user_id', userId)
        .select();

      // DELETE ポリシーが未定義のため 0 rows が返る
      expect(error).toBeNull();
      expect(data).toHaveLength(0);

      // adminClient で行が依然として存在することを確認
      const { data: check } = await adminClient
        .from('onboarding_state')
        .select('user_id')
        .eq('user_id', userId);
      expect(check).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: CASCADE 削除 / SET NULL
  // ---------------------------------------------------------------------------
  describe('CASCADE 削除 / ON DELETE SET NULL', () => {
    it('[正常系] auth.users を削除すると onboarding_state が CASCADE 削除される', async () => {
      const email = `test-obs-cascade-user-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      // 後処理リストには追加しない（このテスト内で削除する）

      await createOnboardingState(userId);

      await deleteTestUser(userId);

      const { data: after } = await adminClient
        .from('onboarding_state')
        .select('user_id')
        .eq('user_id', userId);
      expect(after).toHaveLength(0);
    });

    it('[正常系] tree を削除すると onboarding_state.tree_id が NULL に更新される（ON DELETE SET NULL）', async () => {
      const { userId } = await setupUser('set-null-tree');

      const { data: tree } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userId, title: 'SET NULL テスト' })
        .select()
        .single();

      await createOnboardingState(userId, tree!.id);

      // tree_id が設定されていることを確認
      const { data: before } = await adminClient
        .from('onboarding_state')
        .select('tree_id')
        .eq('user_id', userId)
        .single();
      expect(before!.tree_id).toBe(tree!.id);

      // tree を削除
      await adminClient.from('tree').delete().eq('id', tree!.id);

      // onboarding_state.tree_id が NULL に更新されていることを確認
      const { data: after } = await adminClient
        .from('onboarding_state')
        .select('tree_id')
        .eq('user_id', userId)
        .single();
      expect(after!.tree_id).toBeNull();
    });
  });
});
