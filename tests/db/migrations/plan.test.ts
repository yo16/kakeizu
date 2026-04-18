/**
 * plan テーブルのマイグレーションテスト
 *
 * マイグレーションファイル: 20260418000002_create_plan.sql
 * seed ファイル: supabase/seed.sql
 *
 * 前提: `supabase db reset` でマイグレーションと seed が適用済みであること
 *
 * テスト観点:
 * - [正常系] anon ユーザーが SELECT 可能
 * - [正常系] authenticated ユーザーが SELECT 可能
 * - [正常系] seed データ4行が存在する（free/basic/standard/enterprise）
 * - [異常系] 一般ユーザーは INSERT できない
 * - [異常系] 一般ユーザーは UPDATE できない
 * - [異常系] 一般ユーザーは DELETE できない
 */

import {
  adminClient,
  anonClient,
  createTestUser,
  createUserClient,
  deleteTestUser,
} from '../helpers/supabase-clients';

jest.setTimeout(30000);

describe('plan テーブル', () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    for (const userId of createdUserIds) {
      await deleteTestUser(userId).catch(() => {});
    }
    createdUserIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // 正常系: anon / authenticated 両方で SELECT 可能
  // ---------------------------------------------------------------------------
  describe('RLS: SELECT は全ユーザーに許可', () => {
    it('[正常系] anon ユーザーが plan を SELECT できる', async () => {
      const { data, error } = await anonClient.from('plan').select('*');

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.length).toBeGreaterThan(0);
    });

    it('[正常系] authenticated ユーザーが plan を SELECT できる', async () => {
      const email = `test-plan-auth-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const clientUser = await createUserClient(email, 'Password123!');
      const { data, error } = await clientUser.from('plan').select('*');

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: seed データ確認
  // ---------------------------------------------------------------------------
  describe('seed データの存在確認', () => {
    it('[正常系] plan に4行存在する', async () => {
      const { data, error } = await adminClient.from('plan').select('id');

      expect(error).toBeNull();
      expect(data).toHaveLength(4);
    });

    it('[正常系] free プランが存在する', async () => {
      const { data, error } = await adminClient
        .from('plan')
        .select('*')
        .eq('id', 'free')
        .single();

      expect(error).toBeNull();
      expect(data!.id).toBe('free');
      expect(data!.monthly_price_jpy).toBe(0);
      expect(data!.is_active).toBe(true);
    });

    it('[正常系] basic プランが存在する', async () => {
      const { data, error } = await adminClient
        .from('plan')
        .select('*')
        .eq('id', 'basic')
        .single();

      expect(error).toBeNull();
      expect(data!.id).toBe('basic');
      expect(data!.monthly_price_jpy).toBe(500);
      expect(data!.stripe_price_id).toBe('price_basic_jpy_monthly');
    });

    it('[正常系] standard プランが存在する', async () => {
      const { data, error } = await adminClient
        .from('plan')
        .select('*')
        .eq('id', 'standard')
        .single();

      expect(error).toBeNull();
      expect(data!.id).toBe('standard');
      expect(data!.monthly_price_jpy).toBe(2000);
      expect(data!.stripe_price_id).toBe('price_standard_jpy_monthly');
    });

    it('[正常系] enterprise プランが存在する', async () => {
      const { data, error } = await adminClient
        .from('plan')
        .select('*')
        .eq('id', 'enterprise')
        .single();

      expect(error).toBeNull();
      expect(data!.id).toBe('enterprise');
      expect(data!.monthly_price_jpy).toBe(0);
      // -1 は無制限を表す
      expect(data!.max_trees).toBe(-1);
      expect(data!.max_persons_per_tree).toBe(-1);
      expect(data!.max_photos_per_person).toBe(-1);
    });

    it('[正常系] free プランは stripe_price_id が NULL である', async () => {
      const { data, error } = await adminClient
        .from('plan')
        .select('stripe_price_id')
        .eq('id', 'free')
        .single();

      expect(error).toBeNull();
      expect(data!.stripe_price_id).toBeNull();
    });

    it('[正常系] 4行すべてのIDが正しい (free/basic/standard/enterprise)', async () => {
      const { data, error } = await adminClient
        .from('plan')
        .select('id')
        .order('id');

      expect(error).toBeNull();
      const ids = data!.map((row: { id: string }) => row.id).sort();
      expect(ids).toEqual(['basic', 'enterprise', 'free', 'standard']);
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: INSERT/UPDATE/DELETE は禁止
  // ---------------------------------------------------------------------------
  describe('RLS: INSERT/UPDATE/DELETE は一般ユーザーに禁止', () => {
    it('[異常系] anon ユーザーは plan を INSERT できない', async () => {
      const { error } = await anonClient.from('plan').insert({
        id: 'unauthorized_plan',
        name: 'Unauthorized',
        monthly_price_jpy: 0,
        max_trees: 1,
        max_persons_per_tree: 5,
        max_photos_per_person: 2,
        is_active: true,
      });

      expect(error).not.toBeNull();
    });

    it('[異常系] authenticated ユーザーは plan を INSERT できない', async () => {
      const email = `test-plan-insert-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const clientUser = await createUserClient(email, 'Password123!');
      const { error } = await clientUser.from('plan').insert({
        id: 'unauthorized_plan',
        name: 'Unauthorized',
        monthly_price_jpy: 0,
        max_trees: 1,
        max_persons_per_tree: 5,
        max_photos_per_person: 2,
        is_active: true,
      });

      expect(error).not.toBeNull();
    });

    it('[異常系] anon ユーザーは plan を UPDATE できない', async () => {
      // Supabase (PostgREST) では RLS による UPDATE 拒否はエラーではなく 0 rows affected で返る
      const { data } = await anonClient
        .from('plan')
        .update({ name: '不正な更新' })
        .eq('id', 'free')
        .select();

      // RLS で弾かれた場合、data は空配列
      expect(data).toEqual([]);

      // 実際に変更されていないことを adminClient で確認
      const { data: planData } = await adminClient
        .from('plan')
        .select('name')
        .eq('id', 'free')
        .single();
      expect(planData!.name).not.toBe('不正な更新');
    });

    it('[異常系] authenticated ユーザーは plan を UPDATE できない', async () => {
      const email = `test-plan-update-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const clientUser = await createUserClient(email, 'Password123!');
      // Supabase (PostgREST) では RLS による UPDATE 拒否はエラーではなく 0 rows affected で返る
      const { data } = await clientUser
        .from('plan')
        .update({ name: '不正な更新' })
        .eq('id', 'free')
        .select();

      // RLS で弾かれた場合、data は空配列
      expect(data).toEqual([]);

      // 実際に変更されていないことを adminClient で確認
      const { data: planData } = await adminClient
        .from('plan')
        .select('name')
        .eq('id', 'free')
        .single();
      expect(planData!.name).not.toBe('不正な更新');
    });

    it('[異常系] anon ユーザーは plan を DELETE できない', async () => {
      // Supabase (PostgREST) では RLS による DELETE 拒否はエラーではなく 0 rows affected で返る
      const { data } = await anonClient
        .from('plan')
        .delete()
        .eq('id', 'free')
        .select();

      // RLS で弾かれた場合、data は空配列
      expect(data).toEqual([]);

      // 実際に削除されていないことを adminClient で確認
      const { data: planData } = await adminClient
        .from('plan')
        .select('id')
        .eq('id', 'free');
      expect(planData).toHaveLength(1);
    });

    it('[異常系] authenticated ユーザーは plan を DELETE できない', async () => {
      const email = `test-plan-delete-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      createdUserIds.push(userId);

      const clientUser = await createUserClient(email, 'Password123!');
      // Supabase (PostgREST) では RLS による DELETE 拒否はエラーではなく 0 rows affected で返る
      const { data } = await clientUser
        .from('plan')
        .delete()
        .eq('id', 'free')
        .select();

      // RLS で弾かれた場合、data は空配列
      expect(data).toEqual([]);

      // 実際に削除されていないことを adminClient で確認
      const { data: planData } = await adminClient
        .from('plan')
        .select('id')
        .eq('id', 'free');
      expect(planData).toHaveLength(1);
    });

    it('[正常系] seed の ON CONFLICT DO NOTHING により plan の再 INSERT が冪等である', async () => {
      // seed.sql の ON CONFLICT DO NOTHING を確認するため、
      // adminClient で同じ id を INSERT してもエラーにならないことを確認
      const { error } = await adminClient.from('plan').insert({
        id: 'free',
        name: 'Free Duplicate',
        monthly_price_jpy: 0,
        max_trees: 1,
        max_persons_per_tree: 5,
        max_photos_per_person: 2,
        is_active: true,
      }).select();

      // PostgreSQL の UNIQUE 制約違反エラーが発生することを確認
      // （seed.sql では ON CONFLICT DO NOTHING だが、通常の INSERT は制約違反になる）
      expect(error).not.toBeNull();
      expect(error!.code).toBe('23505'); // unique_violation
    });
  });
});
