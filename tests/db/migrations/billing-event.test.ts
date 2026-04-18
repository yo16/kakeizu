/**
 * billing_event テーブルのマイグレーションテスト
 *
 * マイグレーションファイル: 20260418000004_create_billing_event.sql
 *
 * 前提: `supabase db reset` でマイグレーションと seed が適用済みであること
 *
 * テスト観点:
 * - [正常系] Service Role による INSERT で stripe_event_id UNIQUE が機能する
 * - [異常系] 同じ stripe_event_id で2回INSERT → 失敗
 * - [異常系] anon ユーザーは SELECT できない
 * - [異常系] authenticated ユーザーは SELECT できない
 * - [異常系] anon ユーザーは INSERT できない
 * - [異常系] authenticated ユーザーは INSERT できない
 */

import {
  adminClient,
  anonClient,
  createTestUser,
  createUserClient,
  deleteTestUser,
} from '../helpers/supabase-clients';

jest.setTimeout(30000);

describe('billing_event テーブル', () => {
  const createdUserIds: string[] = [];
  const insertedEventIds: string[] = [];

  afterEach(async () => {
    // 挿入したテストデータを削除（stripe_event_id で削除）
    for (const eventId of insertedEventIds) {
      await adminClient
        .from('billing_event')
        .delete()
        .eq('stripe_event_id', eventId)
        .catch(() => {});
    }
    insertedEventIds.length = 0;

    // テストユーザーを削除
    for (const userId of createdUserIds) {
      await deleteTestUser(userId).catch(() => {});
    }
    createdUserIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // 正常系: Service Role による INSERT
  // ---------------------------------------------------------------------------
  describe('Service Role による INSERT', () => {
    it('[正常系] Service Role で billing_event を INSERT できる', async () => {
      const stripeEventId = `evt_test_${Date.now()}`;
      insertedEventIds.push(stripeEventId);

      const { data, error } = await adminClient
        .from('billing_event')
        .insert({
          stripe_event_id: stripeEventId,
          type: 'customer.subscription.created',
          payload: { test: true },
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.stripe_event_id).toBe(stripeEventId);
    });

    it('[正常系] INSERT した billing_event を Service Role で SELECT できる', async () => {
      const stripeEventId = `evt_test_select_${Date.now()}`;
      insertedEventIds.push(stripeEventId);

      await adminClient.from('billing_event').insert({
        stripe_event_id: stripeEventId,
        type: 'customer.subscription.updated',
        payload: { amount: 500 },
      });

      const { data, error } = await adminClient
        .from('billing_event')
        .select('*')
        .eq('stripe_event_id', stripeEventId)
        .single();

      expect(error).toBeNull();
      expect(data!.stripe_event_id).toBe(stripeEventId);
      expect(data!.type).toBe('customer.subscription.updated');
      expect(data!.payload).toMatchObject({ amount: 500 });
    });

    it('[正常系] processed_at が INSERT 時に自動設定される', async () => {
      const stripeEventId = `evt_test_processed_at_${Date.now()}`;
      insertedEventIds.push(stripeEventId);

      const before = new Date();
      await adminClient.from('billing_event').insert({
        stripe_event_id: stripeEventId,
        type: 'invoice.paid',
        payload: {},
      });

      const { data } = await adminClient
        .from('billing_event')
        .select('processed_at')
        .eq('stripe_event_id', stripeEventId)
        .single();

      expect(data!.processed_at).not.toBeNull();
      expect(new Date(data!.processed_at).getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: UNIQUE 制約（冪等性）
  // ---------------------------------------------------------------------------
  describe('stripe_event_id UNIQUE 制約（冪等性）', () => {
    it('[異常系] 同じ stripe_event_id で2回INSERT すると失敗する', async () => {
      const stripeEventId = `evt_duplicate_${Date.now()}`;
      insertedEventIds.push(stripeEventId);

      // 1回目は成功
      const { error: firstError } = await adminClient
        .from('billing_event')
        .insert({
          stripe_event_id: stripeEventId,
          type: 'customer.subscription.created',
          payload: {},
        });
      expect(firstError).toBeNull();

      // 2回目は UNIQUE 制約違反
      const { error: secondError } = await adminClient
        .from('billing_event')
        .insert({
          stripe_event_id: stripeEventId,
          type: 'customer.subscription.created',
          payload: {},
        });

      expect(secondError).not.toBeNull();
      expect(secondError!.code).toBe('23505'); // unique_violation
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: RLS - 一般ユーザー（anon/authenticated）はすべて拒否
  // ---------------------------------------------------------------------------
  describe('RLS: 一般ユーザーへのアクセスは全拒否', () => {
    it('[異常系] anon ユーザーは billing_event を SELECT できない', async () => {
      const { data, error } = await anonClient
        .from('billing_event')
        .select('*');

      // RLS により 0 件またはエラー
      if (error) {
        expect(error).not.toBeNull();
      } else {
        expect(data).toHaveLength(0);
      }
    });

    it('[異常系] authenticated ユーザーは billing_event を SELECT できない', async () => {
      const email = `test-billing-select-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      // まず Service Role でレコードを作成
      const stripeEventId = `evt_rls_test_${Date.now()}`;
      insertedEventIds.push(stripeEventId);
      await adminClient.from('billing_event').insert({
        stripe_event_id: stripeEventId,
        type: 'test.event',
        payload: {},
      });

      // 認証済みユーザーで SELECT
      const clientUser = await createUserClient(email, 'Password123!');
      const { data, error } = await clientUser
        .from('billing_event')
        .select('*');

      // RLS により 0 件が返る
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[異常系] anon ユーザーは billing_event を INSERT できない', async () => {
      const stripeEventId = `evt_anon_insert_${Date.now()}`;

      const { error } = await anonClient.from('billing_event').insert({
        stripe_event_id: stripeEventId,
        type: 'customer.subscription.created',
        payload: {},
      });

      expect(error).not.toBeNull();
    });

    it('[異常系] authenticated ユーザーは billing_event を INSERT できない', async () => {
      const email = `test-billing-insert-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const clientUser = await createUserClient(email, 'Password123!');
      const stripeEventId = `evt_auth_insert_${Date.now()}`;

      const { error } = await clientUser.from('billing_event').insert({
        stripe_event_id: stripeEventId,
        type: 'customer.subscription.created',
        payload: {},
      });

      expect(error).not.toBeNull();
    });
  });
});
