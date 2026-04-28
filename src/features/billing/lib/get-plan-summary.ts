/**
 * get-plan-summary.ts
 *
 * サーバーサイドヘルパー: ユーザーの subscription + plan 情報と
 * 上限超過判定をまとめて取得する。
 *
 * billing-design.md §2 のデータアクセス仕様に準拠。
 */
import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

/** plan テーブルの行型 */
export interface PlanRow {
  id: string;
  name: string;
  monthly_price_jpy: number;
  max_trees: number;
  max_persons_per_tree: number;
  max_photos_per_person: number;
  stripe_price_id: string | null;
  is_active: boolean;
}

/** subscription テーブルの行型 (取得カラムに限定) */
export interface SubscriptionRow {
  plan_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
}

/** 上限超過エントリ */
export interface OverageEntry {
  resource: 'tree' | 'person' | 'photo';
  current: number;
  limit: number;
}

/** getPlanSummary の戻り値 */
export interface PlanSummary {
  subscription: SubscriptionRow;
  currentPlan: PlanRow | null;
  plans: PlanRow[];
  overages: OverageEntry[];
}

/** Free プランのデフォルト subscription (DB レコードがない場合に使用) */
const DEFAULT_SUBSCRIPTION: SubscriptionRow = {
  plan_id: 'free',
  status: 'active',
  current_period_end: null,
  cancel_at_period_end: false,
  stripe_customer_id: null,
};

/**
 * ログイン済みユーザーのプランサマリーを取得する。
 *
 * React cache() でラップしているため、同一リクエスト内では
 * 同じ userId に対して DB クエリは 1 回のみ実行される
 * (Next.js Request Memoization)。
 *
 * @param userId - Supabase Auth の user.id
 * @returns PlanSummary
 */
export const getPlanSummary = cache(async (userId: string): Promise<PlanSummary> => {
  const supabase = await createClient();

  // ---- 1. subscription 取得 ----
  const { data: subData, error: subError } = await supabase
    .from('subscription')
    .select(
      'plan_id, status, current_period_end, cancel_at_period_end, stripe_customer_id'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (subError) {
    console.error('[getPlanSummary] subscription 取得エラー:', subError);
  }

  const subscription: SubscriptionRow = subData ?? DEFAULT_SUBSCRIPTION;

  // ---- 2. plan テーブル全件取得 ----
  const { data: plansData, error: plansError } = await supabase
    .from('plan')
    .select(
      'id, name, monthly_price_jpy, max_trees, max_persons_per_tree, max_photos_per_person, stripe_price_id, is_active'
    )
    .eq('is_active', true)
    .order('monthly_price_jpy', { ascending: true });

  if (plansError) {
    console.error('[getPlanSummary] plan 取得エラー:', plansError);
  }

  const plans: PlanRow[] = (plansData ?? []) as PlanRow[];
  const currentPlan = plans.find((p) => p.id === subscription.plan_id) ?? null;

  // ---- 3. 上限超過判定 (簡易実装: ツリー数のみ) ----
  const overages: OverageEntry[] = [];

  if (currentPlan && currentPlan.max_trees !== -1) {
    const { count: treeCount, error: treeError } = await supabase
      .from('tree')
      .select('id', { count: 'exact', head: true })
      .eq('owner_user_id', userId);

    if (treeError) {
      console.error('[getPlanSummary] tree count 取得エラー:', treeError);
    } else if (treeCount !== null && treeCount > currentPlan.max_trees) {
      overages.push({
        resource: 'tree',
        current: treeCount,
        limit: currentPlan.max_trees,
      });
    }
  }

  return { subscription, currentPlan, plans, overages };
});
