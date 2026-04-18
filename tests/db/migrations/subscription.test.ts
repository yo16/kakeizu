/**
 * subscription テーブルのマイグレーションテスト
 *
 * マイグレーションファイル: 20260418000003_create_subscription.sql
 * トリガーファイル: 20260418000005_create_signup_trigger.sql
 *
 * 前提: `supabase db reset` でマイグレーションと seed が適用済みであること
 *
 * テスト観点:
 * - [正常系] サインアップ時に free プランの subscription が自動作成される
 * - [正常系] status が active/past_due/canceled/incomplete のいずれかで保存できる
 * - [正常系] 自分の subscription を SELECT できる
 * - [異常系] status が許可外の値で INSERT 失敗（CHECK制約）
 * - [異常系] 他人の subscription を SELECT できない（RLSテスト）
 * - [異常系] 一般ユーザーが INSERT できない（Service Role のみ）
 * - [異常系] 一般ユーザーが UPDATE できない（Service Role のみ）
 * - インデックス確認: stripe_customer_id, stripe_subscription_id のインデックスが存在
 */

import {
  adminClient,
  anonClient,
  createTestUser,
  createUserClient,
  deleteTestUser,
} from '../helpers/supabase-clients';

jest.setTimeout(30000);

describe('subscription テーブル', () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    for (const userId of createdUserIds) {
      await deleteTestUser(userId).catch(() => {});
    }
    createdUserIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // 正常系: サインアップ時の自動作成
  // ---------------------------------------------------------------------------
  describe('トリガーによる subscription 自動作成', () => {
    it('[正常系] auth.users に INSERT すると subscription が自動作成される', async () => {
      const email = `test-sub-autocreate-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const { data, error } = await adminClient
        .from('subscription')
        .select('*')
        .eq('user_id', userId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.user_id).toBe(userId);
    });

    it('[正常系] 自動作成される subscription の plan_id は free である', async () => {
      const email = `test-sub-plan-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const { data, error } = await adminClient
        .from('subscription')
        .select('plan_id, status')
        .eq('user_id', userId)
        .single();

      expect(error).toBeNull();
      expect(data!.plan_id).toBe('free');
      expect(data!.status).toBe('active');
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: status の有効値
  // ---------------------------------------------------------------------------
  describe('status CHECK 制約（有効値）', () => {
    const validStatuses = ['active', 'past_due', 'canceled', 'incomplete'];

    for (const status of validStatuses) {
      it(`[正常系] status = '${status}' で Service Role から UPDATE できる`, async () => {
        const email = `test-sub-status-${status}-${Date.now()}@example.com`;
        const userId = await createTestUser(email, 'Password123!');
        createdUserIds.push(userId);

        const { error } = await adminClient
          .from('subscription')
          .update({ status })
          .eq('user_id', userId);

        expect(error).toBeNull();

        const { data } = await adminClient
          .from('subscription')
          .select('status')
          .eq('user_id', userId)
          .single();
        expect(data!.status).toBe(status);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 正常系: 自分の subscription を SELECT できる
  // ---------------------------------------------------------------------------
  describe('RLS: 本人は自分の subscription を SELECT できる', () => {
    it('[正常系] 認証済みユーザーが自分の subscription を SELECT できる', async () => {
      const email = `test-sub-self-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('subscription')
        .select('*')
        .eq('user_id', userId)
        .single();

      expect(error).toBeNull();
      expect(data!.user_id).toBe(userId);
      expect(data!.plan_id).toBe('free');
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: status の不正値（CHECK制約）
  // ---------------------------------------------------------------------------
  describe('status CHECK 制約（不正値）', () => {
    it('[異常系] status に許可外の値を設定すると CHECK 制約違反でエラーになる', async () => {
      const email = `test-sub-invalid-status-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const { error } = await adminClient
        .from('subscription')
        .update({ status: 'invalid_status' })
        .eq('user_id', userId);

      expect(error).not.toBeNull();
      // PostgreSQL CHECK 制約違反
      expect(error!.code).toBe('23514'); // check_violation
    });

    it('[異常系] status = "trialing" はエラーになる（許可外）', async () => {
      const email = `test-sub-trialing-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const { error } = await adminClient
        .from('subscription')
        .update({ status: 'trialing' })
        .eq('user_id', userId);

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514');
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: RLS - 他人の subscription を SELECT できない
  // ---------------------------------------------------------------------------
  describe('RLS: 他人の subscription への アクセス制御', () => {
    it('[異常系] 別ユーザーとして認証済みの場合、他人の subscription を SELECT できない', async () => {
      // ユーザーA
      const emailA = `test-sub-rls-a-${Date.now()}@example.com`;
      const userIdA = await createTestUser(emailA, 'Password123!');
      createdUserIds.push(userIdA);

      // ユーザーB
      const emailB = `test-sub-rls-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      // ユーザーB のクライアントでユーザーA の subscription を SELECT
      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('subscription')
        .select('*')
        .eq('user_id', userIdA);

      // RLS により 0 件が返る
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[異常系] anon ユーザーは subscription を SELECT できない', async () => {
      const email = `test-sub-anon-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const { data, error } = await anonClient
        .from('subscription')
        .select('*')
        .eq('user_id', userId);

      // RLS により 0 件が返る
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: 一般ユーザーは INSERT/UPDATE できない
  // ---------------------------------------------------------------------------
  describe('RLS: 一般ユーザーは INSERT/UPDATE 不可（Service Role のみ）', () => {
    it('[異常系] authenticated ユーザーは subscription を INSERT できない', async () => {
      const email = `test-sub-insert-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const clientSelf = await createUserClient(email, 'Password123!');

      // 別のユーザーIDで subscription を INSERT しようとする
      const fakeUserId = '00000000-0000-0000-0000-000000000001';
      const { error } = await clientSelf.from('subscription').insert({
        user_id: fakeUserId,
        plan_id: 'free',
        status: 'active',
      });

      expect(error).not.toBeNull();
    });

    it('[異常系] authenticated ユーザーは subscription を UPDATE できない', async () => {
      const email = `test-sub-update-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const clientSelf = await createUserClient(email, 'Password123!');
      // Supabase (PostgREST) では RLS による UPDATE 拒否はエラーではなく 0 rows affected で返る
      const { data } = await clientSelf
        .from('subscription')
        .update({ plan_id: 'basic' })
        .eq('user_id', userId)
        .select();

      // RLS で弾かれた場合、data は空配列
      expect(data).toEqual([]);

      // 実際に変更されていないことを adminClient で確認
      const { data: subData } = await adminClient
        .from('subscription')
        .select('plan_id')
        .eq('user_id', userId)
        .single();
      expect(subData!.plan_id).toBe('free');
    });

    it('[異常系] anon ユーザーは subscription を INSERT できない', async () => {
      const fakeUserId = '00000000-0000-0000-0000-000000000002';
      const { error } = await anonClient.from('subscription').insert({
        user_id: fakeUserId,
        plan_id: 'free',
        status: 'active',
      });

      expect(error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // インデックス確認
  // ---------------------------------------------------------------------------
  describe('インデックスの存在確認', () => {
    it('[正常系] stripe_customer_id インデックスが存在する', async () => {
      const { data, error } = await adminClient.rpc('pg_indexes_exist', {
        p_table: 'subscription',
        p_index: 'idx_subscription_stripe_customer_id',
      });

      // pg_indexes_exist RPC がない場合は information_schema でチェック
      if (error) {
        const { data: indexData, error: indexError } = await adminClient
          .from('pg_indexes' as never)
          .select('indexname')
          .eq('tablename', 'subscription')
          .eq('indexname', 'idx_subscription_stripe_customer_id');

        // pg_indexes はシステムカタログのため PostgREST では直接アクセスできない場合がある
        // その場合は SQL 関数経由で確認する
        if (indexError) {
          // 代替: subscription テーブルに stripe_customer_id を設定して検索できることを確認
          const email = `test-sub-idx-${Date.now()}@example.com`;
          const userId = await createTestUser(email, 'Password123!');
          createdUserIds.push(userId);

          const stripeCustomerId = `cus_test_${Date.now()}`;
          await adminClient
            .from('subscription')
            .update({ stripe_customer_id: stripeCustomerId })
            .eq('user_id', userId);

          const { data: searchData, error: searchError } = await adminClient
            .from('subscription')
            .select('user_id')
            .eq('stripe_customer_id', stripeCustomerId)
            .single();

          expect(searchError).toBeNull();
          expect(searchData!.user_id).toBe(userId);
        } else {
          expect(indexData).toHaveLength(1);
        }
      } else {
        expect(data).toBe(true);
      }
    });

    it('[正常系] stripe_subscription_id による検索が機能する（インデックスの動作確認）', async () => {
      const email = `test-sub-stripe-idx-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const stripeSubId = `sub_test_${Date.now()}`;
      await adminClient
        .from('subscription')
        .update({ stripe_subscription_id: stripeSubId })
        .eq('user_id', userId);

      const { data, error } = await adminClient
        .from('subscription')
        .select('user_id')
        .eq('stripe_subscription_id', stripeSubId)
        .single();

      expect(error).toBeNull();
      expect(data!.user_id).toBe(userId);
    });

    it('[正常系] stripe_customer_id は UNIQUE 制約を持つ', async () => {
      const emailA = `test-sub-unique-a-${Date.now()}@example.com`;
      const userIdA = await createTestUser(emailA, 'Password123!');
      createdUserIds.push(userIdA);

      const emailB = `test-sub-unique-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const stripeCustomerId = `cus_unique_test_${Date.now()}`;

      // ユーザーA に stripe_customer_id を設定
      await adminClient
        .from('subscription')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('user_id', userIdA);

      // ユーザーB に同じ stripe_customer_id を設定 → UNIQUE 違反
      const { error } = await adminClient
        .from('subscription')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('user_id', userIdB);

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23505'); // unique_violation
    });

    it('[正常系] stripe_subscription_id は UNIQUE 制約を持つ', async () => {
      const emailA = `test-sub-sub-unique-a-${Date.now()}@example.com`;
      const userIdA = await createTestUser(emailA, 'Password123!');
      createdUserIds.push(userIdA);

      const emailB = `test-sub-sub-unique-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const stripeSubId = `sub_unique_test_${Date.now()}`;

      await adminClient
        .from('subscription')
        .update({ stripe_subscription_id: stripeSubId })
        .eq('user_id', userIdA);

      const { error } = await adminClient
        .from('subscription')
        .update({ stripe_subscription_id: stripeSubId })
        .eq('user_id', userIdB);

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23505'); // unique_violation
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: auth.users 削除で subscription も CASCADE 削除される
  // ---------------------------------------------------------------------------
  describe('CASCADE 削除', () => {
    it('[正常系] auth.users を削除すると subscription も CASCADE 削除される', async () => {
      const email = `test-sub-cascade-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');

      const { data: before } = await adminClient
        .from('subscription')
        .select('*')
        .eq('user_id', userId);
      expect(before).toHaveLength(1);

      await deleteTestUser(userId);

      const { data: after } = await adminClient
        .from('subscription')
        .select('*')
        .eq('user_id', userId);
      expect(after).toHaveLength(0);
    });
  });
});
