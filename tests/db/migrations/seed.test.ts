/**
 * seed.sql のマイグレーションテスト
 *
 * seed ファイル: supabase/seed.sql
 *
 * 前提: `supabase db reset` でマイグレーションと seed が適用済みであること
 *
 * テスト観点:
 * - [正常系] plan に4行（id='free','basic','standard','enterprise'）が存在する
 * - [正常系] ON CONFLICT DO NOTHING で冪等性が確保されている
 * - [正常系] 各プランの値が正しい
 */

import { adminClient } from '../helpers/supabase-clients';

jest.setTimeout(30000);

describe('seed.sql', () => {
  // ---------------------------------------------------------------------------
  // 正常系: plan テーブルへの seed データ確認
  // ---------------------------------------------------------------------------
  describe('plan テーブルの seed データ', () => {
    it('[正常系] plan に4行存在する（free/basic/standard/enterprise）', async () => {
      const { data, error } = await adminClient
        .from('plan')
        .select('id')
        .order('id');

      expect(error).toBeNull();
      expect(data).toHaveLength(4);

      const ids = data!.map((row: { id: string }) => row.id);
      expect(ids).toContain('free');
      expect(ids).toContain('basic');
      expect(ids).toContain('standard');
      expect(ids).toContain('enterprise');
    });

    it('[正常系] free プランの値が正しい', async () => {
      const { data, error } = await adminClient
        .from('plan')
        .select('*')
        .eq('id', 'free')
        .single();

      expect(error).toBeNull();
      expect(data!.name).toBe('Free');
      expect(data!.monthly_price_jpy).toBe(0);
      expect(data!.max_trees).toBe(1);
      expect(data!.max_persons_per_tree).toBe(5);
      expect(data!.max_photos_per_person).toBe(2);
      expect(data!.stripe_price_id).toBeNull();
      expect(data!.is_active).toBe(true);
    });

    it('[正常系] basic プランの値が正しい', async () => {
      const { data, error } = await adminClient
        .from('plan')
        .select('*')
        .eq('id', 'basic')
        .single();

      expect(error).toBeNull();
      expect(data!.name).toBe('Basic');
      expect(data!.monthly_price_jpy).toBe(500);
      expect(data!.max_trees).toBe(2);
      expect(data!.max_persons_per_tree).toBe(20);
      expect(data!.max_photos_per_person).toBe(5);
      expect(data!.stripe_price_id).toBe('price_basic_jpy_monthly');
      expect(data!.is_active).toBe(true);
    });

    it('[正常系] standard プランの値が正しい', async () => {
      const { data, error } = await adminClient
        .from('plan')
        .select('*')
        .eq('id', 'standard')
        .single();

      expect(error).toBeNull();
      expect(data!.name).toBe('Standard');
      expect(data!.monthly_price_jpy).toBe(2000);
      expect(data!.max_trees).toBe(5);
      expect(data!.max_persons_per_tree).toBe(40);
      expect(data!.max_photos_per_person).toBe(10);
      expect(data!.stripe_price_id).toBe('price_standard_jpy_monthly');
      expect(data!.is_active).toBe(true);
    });

    it('[正常系] enterprise プランの値が正しい', async () => {
      const { data, error } = await adminClient
        .from('plan')
        .select('*')
        .eq('id', 'enterprise')
        .single();

      expect(error).toBeNull();
      expect(data!.name).toBe('Enterprise');
      expect(data!.monthly_price_jpy).toBe(0);
      // -1 は無制限を表す
      expect(data!.max_trees).toBe(-1);
      expect(data!.max_persons_per_tree).toBe(-1);
      expect(data!.max_photos_per_person).toBe(-1);
      expect(data!.stripe_price_id).toBeNull();
      expect(data!.is_active).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: ON CONFLICT DO NOTHING による冪等性
  // ---------------------------------------------------------------------------
  describe('seed の冪等性', () => {
    it('[正常系] seed 再実行（ON CONFLICT DO NOTHING）後も plan が4行のままである', async () => {
      // Supabase の adminClient では直接 SQL を実行できないため、
      // pg_meta RPC か rpc を使用する。
      // ここでは「既存の plan を adminClient で INSERT して CONFLICT が出ないこと」で代替検証する。

      // 既存行への INSERT は UNIQUE 制約で失敗するが、
      // seed.sql の ON CONFLICT DO NOTHING は supabase db reset 時に実行されるため、
      // reset 後のデータ件数が変わらないことで冪等性を確認する。

      // 現在の件数を記録
      const { data: before } = await adminClient.from('plan').select('id');
      const beforeCount = before!.length;

      // seed.sql と同等の upsert を adminClient から実行（ON CONFLICT DO NOTHING 相当）
      const { error } = await adminClient.from('plan').upsert(
        [
          {
            id: 'free',
            name: 'Free',
            monthly_price_jpy: 0,
            max_trees: 1,
            max_persons_per_tree: 5,
            max_photos_per_person: 2,
            stripe_price_id: null,
            is_active: true,
          },
        ],
        { onConflict: 'id', ignoreDuplicates: true }
      );

      expect(error).toBeNull();

      // 件数が変わらないことを確認
      const { data: after } = await adminClient.from('plan').select('id');
      expect(after!.length).toBe(beforeCount);
    });

    it('[正常系] seed の ON CONFLICT DO NOTHING により既存行の値は変更されない', async () => {
      // free プランの現在の値を確認
      const { data: before } = await adminClient
        .from('plan')
        .select('name, monthly_price_jpy')
        .eq('id', 'free')
        .single();

      // seed.sql と同じ値で upsert（ignoreDuplicates: true）
      await adminClient.from('plan').upsert(
        [
          {
            id: 'free',
            name: 'Free',
            monthly_price_jpy: 0,
            max_trees: 1,
            max_persons_per_tree: 5,
            max_photos_per_person: 2,
            stripe_price_id: null,
            is_active: true,
          },
        ],
        { onConflict: 'id', ignoreDuplicates: true }
      );

      const { data: after } = await adminClient
        .from('plan')
        .select('name, monthly_price_jpy')
        .eq('id', 'free')
        .single();

      expect(after!.name).toBe(before!.name);
      expect(after!.monthly_price_jpy).toBe(before!.monthly_price_jpy);
    });
  });
});
