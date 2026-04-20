/**
 * プラン上限チェック
 *
 * billing-design.md §5 の仕様に従い、各リソースの上限チェックを行う。
 * 上限超過時は PlanLimitError をスローする。
 *
 * 呼び出し箇所:
 *   - createTree        → assertWithinLimit({ kind: 'tree', userId })
 *   - createPerson      → assertWithinLimit({ kind: 'person', userId, treeId })
 *   - quickAddRelative  → assertWithinLimit({ kind: 'person', userId, treeId })
 *   - 署名 URL 発行時   → assertWithinLimit({ kind: 'photo', userId, personId })
 *   - DB 登録時         → assertWithinLimit({ kind: 'photo', userId, personId })
 */
import 'server-only';

import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// PlanLimitError
// ---------------------------------------------------------------------------

/** プラン上限超過エラーのコード */
export const PLAN_LIMIT_EXCEEDED = 'PLAN_LIMIT_EXCEEDED' as const;

/** プラン上限超過エラー情報 */
export interface PlanLimitErrorInfo {
  /** 上限超過したリソース種別 */
  resource: 'tree' | 'person' | 'photo';
  /** 現在の件数 */
  current: number;
  /** プランの上限値 (-1 は無制限) */
  limit: number;
  /** ユーザーの現在のプラン ID */
  planId: string;
}

/**
 * プラン上限超過エラー。
 * Server Action でキャッチして ActionResult の PLAN_LIMIT_EXCEEDED コードに変換すること。
 */
export class PlanLimitError extends Error {
  readonly code = PLAN_LIMIT_EXCEEDED;
  readonly info: PlanLimitErrorInfo;

  constructor(message: string, info: PlanLimitErrorInfo) {
    super(message);
    this.name = 'PlanLimitError';
    this.info = info;
  }
}

// ---------------------------------------------------------------------------
// プランごとの上限値定義 (billing-design.md §1)
// ---------------------------------------------------------------------------

/** プラン上限値の型 */
export interface PlanLimits {
  max_trees: number;
  max_persons_per_tree: number;
  max_photos_per_person: number;
}

/**
 * プランごとのデフォルト上限値。
 * DB の plan テーブルが source of truth だが、アプリ層でのフォールバック用に定義する。
 * DB から取得できた場合は DB の値を優先する。
 */
export const PLAN_LIMITS_DEFAULT: Record<string, PlanLimits> = {
  free: {
    max_trees: 1,
    max_persons_per_tree: 5,
    max_photos_per_person: 2,
  },
  basic: {
    max_trees: 2,
    max_persons_per_tree: 20,
    max_photos_per_person: 5,
  },
  standard: {
    max_trees: 5,
    max_persons_per_tree: 40,
    max_photos_per_person: 10,
  },
  enterprise: {
    max_trees: -1,
    max_persons_per_tree: -1,
    max_photos_per_person: -1,
  },
} as const;

// ---------------------------------------------------------------------------
// getCurrentPlan: subscription + plan の取得
// ---------------------------------------------------------------------------

/** subscription + plan の結合結果 */
interface CurrentPlan {
  planId: string;
  limits: PlanLimits;
}

/**
 * ユーザーの現在のプランと上限値を取得する。
 *
 * subscription テーブルから active / past_due なサブスクリプションを取得し、
 * plan テーブルの上限値を JOIN で取得する。
 *
 * - subscription が存在しない場合は free プランとして扱う。
 * - status が incomplete の場合は free プランとして扱う。
 *
 * @param userId - 認証ユーザーの UUID
 * @returns 現在のプラン ID と上限値
 */
export async function getCurrentPlan(userId: string): Promise<CurrentPlan> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('subscription')
    .select(
      `
      plan_id,
      status,
      plan:plan_id (
        max_trees,
        max_persons_per_tree,
        max_photos_per_person
      )
    `
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[getCurrentPlan] subscription fetch error:', error.message);
    // エラー時は free プランとして安全側に倒す
    return buildFreePlan();
  }

  if (!data) {
    // subscription 行がない場合は free プラン
    return buildFreePlan();
  }

  // incomplete は free 扱い (billing-design.md §2)
  if (data.status === 'incomplete') {
    return buildFreePlan();
  }

  const planRow = Array.isArray(data.plan) ? data.plan[0] : data.plan;

  if (!planRow) {
    console.error('[getCurrentPlan] plan row not found for plan_id:', data.plan_id);
    return buildFreePlan();
  }

  return {
    planId: data.plan_id,
    limits: {
      max_trees: planRow.max_trees,
      max_persons_per_tree: planRow.max_persons_per_tree,
      max_photos_per_person: planRow.max_photos_per_person,
    },
  };
}

/** Free プランの CurrentPlan を生成する */
function buildFreePlan(): CurrentPlan {
  return {
    planId: 'free',
    limits: PLAN_LIMITS_DEFAULT.free,
  };
}

// ---------------------------------------------------------------------------
// 上限チェック関数
// ---------------------------------------------------------------------------

/**
 * ユーザーの tree 数がプラン上限に達していないか確認する。
 * 上限に達している場合は PlanLimitError をスローする。
 *
 * @param userId - 認証ユーザーの UUID
 * @throws PlanLimitError - 上限に達している場合
 */
export async function checkTreeLimit(userId: string): Promise<void> {
  const supabase = await createClient();
  const { planId, limits } = await getCurrentPlan(userId);

  // -1 は無制限
  if (limits.max_trees === -1) {
    return;
  }

  const { count, error } = await supabase
    .from('tree')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', userId);

  if (error) {
    console.error('[checkTreeLimit] tree count error:', error.message);
    throw new Error(`[checkTreeLimit] DB error: ${error.message}`);
  }

  const current = count ?? 0;

  if (current >= limits.max_trees) {
    throw new PlanLimitError(
      `プランの上限（${limits.max_trees} ツリー）に達しています。アップグレードするか、不要なツリーを削除してください。`,
      {
        resource: 'tree',
        current,
        limit: limits.max_trees,
        planId,
      }
    );
  }
}

/**
 * ツリー内の person 数がプラン上限に達していないか確認する。
 * 上限に達している場合は PlanLimitError をスローする。
 *
 * @param userId - 認証ユーザーの UUID (プラン取得に使用)
 * @param treeId - 対象ツリーの UUID
 * @throws PlanLimitError - 上限に達している場合
 */
export async function checkPersonLimit(
  userId: string,
  treeId: string
): Promise<void> {
  const supabase = await createClient();
  const { planId, limits } = await getCurrentPlan(userId);

  // -1 は無制限
  if (limits.max_persons_per_tree === -1) {
    return;
  }

  const { count, error } = await supabase
    .from('person')
    .select('id', { count: 'exact', head: true })
    .eq('tree_id', treeId);

  if (error) {
    console.error('[checkPersonLimit] person count error:', error.message);
    throw new Error(`[checkPersonLimit] DB error: ${error.message}`);
  }

  const current = count ?? 0;

  if (current >= limits.max_persons_per_tree) {
    throw new PlanLimitError(
      `プランの上限（${limits.max_persons_per_tree} 人）に達しています。アップグレードするか、不要な人物を削除してください。`,
      {
        resource: 'person',
        current,
        limit: limits.max_persons_per_tree,
        planId,
      }
    );
  }
}

/**
 * 人物に紐づく photo 数がプラン上限に達していないか確認する。
 * photo_person_link テーブルで personId に紐づく写真数を COUNT する。
 * 上限に達している場合は PlanLimitError をスローする。
 *
 * @param userId - 認証ユーザーの UUID (プラン取得に使用)
 * @param personId - 対象人物の UUID
 * @throws PlanLimitError - 上限に達している場合
 */
export async function checkPhotoLimit(
  userId: string,
  personId: string
): Promise<void> {
  const supabase = await createClient();
  const { planId, limits } = await getCurrentPlan(userId);

  // -1 は無制限
  if (limits.max_photos_per_person === -1) {
    return;
  }

  const { count, error } = await supabase
    .from('photo_person_link')
    .select('photo_id', { count: 'exact', head: true })
    .eq('person_id', personId);

  if (error) {
    console.error('[checkPhotoLimit] photo count error:', error.message);
    throw new Error(`[checkPhotoLimit] DB error: ${error.message}`);
  }

  const current = count ?? 0;

  if (current >= limits.max_photos_per_person) {
    throw new PlanLimitError(
      `プランの上限（${limits.max_photos_per_person} 枚/人）に達しています。アップグレードするか、不要な写真を削除してください。`,
      {
        resource: 'photo',
        current,
        limit: limits.max_photos_per_person,
        planId,
      }
    );
  }
}

// ---------------------------------------------------------------------------
// assertWithinLimit: 共通インターフェース (billing-design.md §5)
// ---------------------------------------------------------------------------

/** 上限チェック対象の型 */
export type LimitCheckTarget =
  | { kind: 'tree'; userId: string }
  | { kind: 'person'; userId: string; treeId: string }
  | { kind: 'photo'; userId: string; personId: string };

/**
 * プラン上限チェックの共通エントリポイント。
 *
 * 呼び出し側は target の kind に応じて引数を渡す。
 * 上限超過時は PlanLimitError をスローするため、呼び出し側で catch して
 * ActionResult の PLAN_LIMIT_EXCEEDED コードに変換すること。
 *
 * @example
 * // createTree の場合
 * await assertWithinLimit({ kind: 'tree', userId });
 *
 * @example
 * // createPerson の場合
 * await assertWithinLimit({ kind: 'person', userId, treeId });
 *
 * @example
 * // 写真アップロードの場合
 * await assertWithinLimit({ kind: 'photo', userId, personId });
 *
 * @throws PlanLimitError - プラン上限に達している場合
 */
export async function assertWithinLimit(target: LimitCheckTarget): Promise<void> {
  switch (target.kind) {
    case 'tree':
      await checkTreeLimit(target.userId);
      break;
    case 'person':
      await checkPersonLimit(target.userId, target.treeId);
      break;
    case 'photo':
      await checkPhotoLimit(target.userId, target.personId);
      break;
    default: {
      // exhaustive check
      const _exhaustive: never = target;
      throw new Error(`[assertWithinLimit] unknown kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
