/**
 * src/lib/plan/limits.ts の単体テスト
 *
 * @/lib/supabase/server の createClient をモックし、
 * Supabase クエリチェーンをテスト内で構築して各関数の動作を検証する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// Supabase クライアントをモック
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import {
  getCurrentPlan,
  checkTreeLimit,
  checkPersonLimit,
  checkPhotoLimit,
  assertWithinLimit,
  PlanLimitError,
  PLAN_LIMIT_EXCEEDED,
  PLAN_LIMITS_DEFAULT,
} from '../limits';
import { createClient } from '@/lib/supabase/server';

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// テスト用 UUID
const USER_ID = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const PERSON_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Supabase クエリビルダヘルパー
// ---------------------------------------------------------------------------

/**
 * maybeSingle() で終わる subscription+plan JOIN クエリチェーンを構築する。
 * from('subscription').select(...).eq('user_id', userId).maybeSingle()
 */
function buildSubscriptionChain(maybeSingleResult: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.maybeSingle = jest.fn().mockResolvedValue(maybeSingleResult);
  return chain;
}

/**
 * select('id', { count: 'exact', head: true }).eq(...) で終わる count クエリチェーン。
 * 実装側は await supabase.from(...).select(...).eq(...) と書かれており、
 * eq() が最後に await されるため mockResolvedValue で解決する。
 */
function buildCountChain(countResult: { count: number | null; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn().mockResolvedValue(countResult);
  return chain;
}

/**
 * getCurrentPlan 内で使用する supabase クライアントのモックを生成する。
 * from('subscription') に対して maybeSingleResult を返す。
 */
function buildSupabaseWithSubscription(maybeSingleResult: { data: unknown; error: unknown }) {
  const subscriptionChain = buildSubscriptionChain(maybeSingleResult);
  return {
    from: jest.fn().mockReturnValue(subscriptionChain),
  };
}

/**
 * checkTreeLimit / checkPersonLimit / checkPhotoLimit で使用する supabase クライアントのモックを生成する。
 * 1回目の from() 呼び出し: subscription クエリ
 * 2回目の from() 呼び出し: count クエリ
 */
function buildSupabaseForCheckLimit(
  subscriptionResult: { data: unknown; error: unknown },
  countResult: { count: number | null; error: unknown }
) {
  const mockFrom = jest.fn();
  let callIndex = 0;

  mockFrom.mockImplementation(() => {
    callIndex++;
    if (callIndex === 1) {
      return buildSubscriptionChain(subscriptionResult);
    }
    return buildCountChain(countResult);
  });

  return { from: mockFrom };
}

// ---------------------------------------------------------------------------
// テスト用の subscription データ生成ヘルパー
// ---------------------------------------------------------------------------

function makeSubscriptionData(
  planId: string,
  status: string,
  planLimits: { max_trees: number; max_persons_per_tree: number; max_photos_per_person: number }
) {
  return {
    plan_id: planId,
    status,
    plan: {
      max_trees: planLimits.max_trees,
      max_persons_per_tree: planLimits.max_persons_per_tree,
      max_photos_per_person: planLimits.max_photos_per_person,
    },
  };
}

// ===========================================================================
// PlanLimitError クラス
// ===========================================================================

describe('PlanLimitError', () => {
  const info = {
    resource: 'tree' as const,
    current: 1,
    limit: 1,
    planId: 'free',
  };

  it('error.code === PLAN_LIMIT_EXCEEDED であること', () => {
    const error = new PlanLimitError('上限エラー', info);
    expect(error.code).toBe(PLAN_LIMIT_EXCEEDED);
  });

  it('error instanceof Error が true であること', () => {
    const error = new PlanLimitError('上限エラー', info);
    expect(error).toBeInstanceOf(Error);
  });

  it('error.info に resource / current / limit / planId が含まれること', () => {
    const error = new PlanLimitError('上限エラー', info);
    expect(error.info).toEqual({
      resource: 'tree',
      current: 1,
      limit: 1,
      planId: 'free',
    });
  });

  it('error.name が PlanLimitError であること', () => {
    const error = new PlanLimitError('上限エラー', info);
    expect(error.name).toBe('PlanLimitError');
  });

  it('error.message が渡した文字列であること', () => {
    const error = new PlanLimitError('テストメッセージ', info);
    expect(error.message).toBe('テストメッセージ');
  });
});

// ===========================================================================
// getCurrentPlan
// ===========================================================================

describe('getCurrentPlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('subscription が存在しない場合', () => {
    it('data: null → Free プランを返すこと', async () => {
      const supabase = buildSupabaseWithSubscription({ data: null, error: null });

      const result = await getCurrentPlan(USER_ID, supabase as never);

      expect(result).toEqual({
        planId: 'free',
        limits: PLAN_LIMITS_DEFAULT.free,
      });
    });
  });

  describe('status によるホワイトリスト判定', () => {
    it('status が active → DB の plan を返すこと', async () => {
      const data = makeSubscriptionData('basic', 'active', PLAN_LIMITS_DEFAULT.basic);
      const supabase = buildSupabaseWithSubscription({ data, error: null });

      const result = await getCurrentPlan(USER_ID, supabase as never);

      expect(result).toEqual({
        planId: 'basic',
        limits: PLAN_LIMITS_DEFAULT.basic,
      });
    });

    it('status が past_due → DB の plan を返すこと', async () => {
      const data = makeSubscriptionData('standard', 'past_due', PLAN_LIMITS_DEFAULT.standard);
      const supabase = buildSupabaseWithSubscription({ data, error: null });

      const result = await getCurrentPlan(USER_ID, supabase as never);

      expect(result).toEqual({
        planId: 'standard',
        limits: PLAN_LIMITS_DEFAULT.standard,
      });
    });

    it('status が canceled → Free プランを返すこと（ホワイトリスト外）', async () => {
      const data = makeSubscriptionData('basic', 'canceled', PLAN_LIMITS_DEFAULT.basic);
      const supabase = buildSupabaseWithSubscription({ data, error: null });

      const result = await getCurrentPlan(USER_ID, supabase as never);

      expect(result).toEqual({
        planId: 'free',
        limits: PLAN_LIMITS_DEFAULT.free,
      });
    });

    it('status が incomplete → Free プランを返すこと', async () => {
      const data = makeSubscriptionData('basic', 'incomplete', PLAN_LIMITS_DEFAULT.basic);
      const supabase = buildSupabaseWithSubscription({ data, error: null });

      const result = await getCurrentPlan(USER_ID, supabase as never);

      expect(result).toEqual({
        planId: 'free',
        limits: PLAN_LIMITS_DEFAULT.free,
      });
    });

    it('status が unpaid → Free プランを返すこと', async () => {
      const data = makeSubscriptionData('basic', 'unpaid', PLAN_LIMITS_DEFAULT.basic);
      const supabase = buildSupabaseWithSubscription({ data, error: null });

      const result = await getCurrentPlan(USER_ID, supabase as never);

      expect(result).toEqual({
        planId: 'free',
        limits: PLAN_LIMITS_DEFAULT.free,
      });
    });
  });

  describe('DBエラー', () => {
    it('DBエラー → Free プランを返すこと（エラー時は安全側に倒れる）', async () => {
      const supabase = buildSupabaseWithSubscription({
        data: null,
        error: { message: 'connection refused' },
      });

      const result = await getCurrentPlan(USER_ID, supabase as never);

      expect(result).toEqual({
        planId: 'free',
        limits: PLAN_LIMITS_DEFAULT.free,
      });
    });
  });

  describe('planRow が null の場合の Free フォールバック', () => {
    it('subscription は存在し status=active だが plan JOIN 結果が null → Free プランを返すこと', async () => {
      // data.plan が null のケース: subscription 行はあるが plan テーブルの JOIN 結果が null
      const data = {
        plan_id: 'basic',
        status: 'active',
        plan: null, // JOIN 結果が null
      };
      const supabase = buildSupabaseWithSubscription({ data, error: null });

      const result = await getCurrentPlan(USER_ID, supabase as never);

      expect(result).toEqual({
        planId: 'free',
        limits: PLAN_LIMITS_DEFAULT.free,
      });
    });
  });

  describe('supabase 引数の扱い', () => {
    it('supabase 引数を渡した場合、createClient が呼ばれないこと', async () => {
      const supabase = buildSupabaseWithSubscription({ data: null, error: null });

      await getCurrentPlan(USER_ID, supabase as never);

      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it('supabase 引数を省略した場合、createClient が呼ばれること', async () => {
      const supabase = buildSupabaseWithSubscription({ data: null, error: null });
      mockCreateClient.mockResolvedValue(supabase as never);

      await getCurrentPlan(USER_ID);

      expect(mockCreateClient).toHaveBeenCalledTimes(1);
    });
  });
});

// ===========================================================================
// checkTreeLimit
// ===========================================================================

describe('checkTreeLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('現在のツリー数 < 上限 → エラーなし（正常終了）', async () => {
    // free プラン: max_trees=1, 現在 0 件
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: 0, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkTreeLimit(USER_ID)).resolves.toBeUndefined();
  });

  it('現在のツリー数 == 上限 → PlanLimitError をスロー（>= 判定）', async () => {
    // free プラン: max_trees=1, 現在 1 件 (1 >= 1)
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: 1, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkTreeLimit(USER_ID)).rejects.toThrow(PlanLimitError);
  });

  it('現在のツリー数 > 上限 → PlanLimitError をスロー', async () => {
    // free プラン: max_trees=1, 現在 2 件
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: 2, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkTreeLimit(USER_ID)).rejects.toThrow(PlanLimitError);
  });

  it('enterprise プラン (max_trees=-1 無制限) → エラーなし', async () => {
    const data = makeSubscriptionData('enterprise', 'active', PLAN_LIMITS_DEFAULT.enterprise);
    const subscriptionResult = { data, error: null };
    // count クエリは呼ばれないはずだが、念のためセットアップしておく
    const countResult = { count: 999, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkTreeLimit(USER_ID)).resolves.toBeUndefined();
  });

  it('PlanLimitError の info に resource/current/limit/planId が含まれること', async () => {
    // free プラン: max_trees=1, 現在 1 件
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: 1, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    let caughtError: PlanLimitError | null = null;
    try {
      await checkTreeLimit(USER_ID);
    } catch (e) {
      caughtError = e as PlanLimitError;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError!.info).toEqual({
      resource: 'tree',
      current: 1,
      limit: 1,
      planId: 'free',
    });
  });

  it('free プラン (max_trees=1) でツリー 1 つ → スロー（境界値）', async () => {
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: 1, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkTreeLimit(USER_ID)).rejects.toThrow(PlanLimitError);
  });

  it('basic プラン (max_trees=2) でツリー 2 つ → スロー（境界値）', async () => {
    const data = makeSubscriptionData('basic', 'active', PLAN_LIMITS_DEFAULT.basic);
    const subscriptionResult = { data, error: null };
    const countResult = { count: 2, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkTreeLimit(USER_ID)).rejects.toThrow(PlanLimitError);
  });

  it('basic プラン (max_trees=2) でツリー 1 つ → エラーなし', async () => {
    const data = makeSubscriptionData('basic', 'active', PLAN_LIMITS_DEFAULT.basic);
    const subscriptionResult = { data, error: null };
    const countResult = { count: 1, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkTreeLimit(USER_ID)).resolves.toBeUndefined();
  });
});

// ===========================================================================
// checkPersonLimit
// ===========================================================================

describe('checkPersonLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('現在の人物数 < 上限 → エラーなし', async () => {
    // free プラン: max_persons_per_tree=5, 現在 4 件
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: 4, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkPersonLimit(USER_ID, TREE_ID)).resolves.toBeUndefined();
  });

  it('現在の人物数 >= 上限 → PlanLimitError をスロー', async () => {
    // free プラン: max_persons_per_tree=5, 現在 5 件 (5 >= 5)
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: 5, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkPersonLimit(USER_ID, TREE_ID)).rejects.toThrow(PlanLimitError);
  });

  it('無制限プラン (max_persons_per_tree=-1) → エラーなし', async () => {
    const data = makeSubscriptionData('enterprise', 'active', PLAN_LIMITS_DEFAULT.enterprise);
    const subscriptionResult = { data, error: null };
    const countResult = { count: 999, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkPersonLimit(USER_ID, TREE_ID)).resolves.toBeUndefined();
  });

  it('PlanLimitError の info.resource が person であること', async () => {
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: 5, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    let caughtError: PlanLimitError | null = null;
    try {
      await checkPersonLimit(USER_ID, TREE_ID);
    } catch (e) {
      caughtError = e as PlanLimitError;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError!.info.resource).toBe('person');
    expect(caughtError!.info.current).toBe(5);
    expect(caughtError!.info.limit).toBe(PLAN_LIMITS_DEFAULT.free.max_persons_per_tree);
    expect(caughtError!.info.planId).toBe('free');
  });

  it('境界値: 人物数 == 上限 - 1 → エラーなし', async () => {
    // free プラン: max_persons_per_tree=5, 現在 4 件
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: 4, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkPersonLimit(USER_ID, TREE_ID)).resolves.toBeUndefined();
  });

  it('人物数 > 上限 → PlanLimitError をスロー', async () => {
    // free プラン: max_persons_per_tree=5, 現在 6 件
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: 6, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkPersonLimit(USER_ID, TREE_ID)).rejects.toThrow(PlanLimitError);
  });
});

// ===========================================================================
// checkPhotoLimit
// ===========================================================================

describe('checkPhotoLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('現在の写真数 < 上限 → エラーなし', async () => {
    // free プラン: max_photos_per_person=2, 現在 1 件
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: 1, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkPhotoLimit(USER_ID, PERSON_ID)).resolves.toBeUndefined();
  });

  it('現在の写真数 >= 上限 → PlanLimitError をスロー', async () => {
    // free プラン: max_photos_per_person=2, 現在 2 件 (2 >= 2)
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: 2, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkPhotoLimit(USER_ID, PERSON_ID)).rejects.toThrow(PlanLimitError);
  });

  it('無制限プラン (max_photos_per_person=-1) → エラーなし', async () => {
    const data = makeSubscriptionData('enterprise', 'active', PLAN_LIMITS_DEFAULT.enterprise);
    const subscriptionResult = { data, error: null };
    const countResult = { count: 999, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkPhotoLimit(USER_ID, PERSON_ID)).resolves.toBeUndefined();
  });

  it('PlanLimitError の info.resource が photo であること', async () => {
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: 2, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    let caughtError: PlanLimitError | null = null;
    try {
      await checkPhotoLimit(USER_ID, PERSON_ID);
    } catch (e) {
      caughtError = e as PlanLimitError;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError!.info.resource).toBe('photo');
    expect(caughtError!.info.current).toBe(2);
    expect(caughtError!.info.limit).toBe(PLAN_LIMITS_DEFAULT.free.max_photos_per_person);
    expect(caughtError!.info.planId).toBe('free');
  });

  it('写真数 > 上限 → PlanLimitError をスロー', async () => {
    // free プラン: max_photos_per_person=2, 現在 3 件
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: 3, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkPhotoLimit(USER_ID, PERSON_ID)).rejects.toThrow(PlanLimitError);
  });
});

// ===========================================================================
// 不足ケース追加: count が null のフォールバック（count ?? 0）
// ===========================================================================

describe('count が null のフォールバック (count ?? 0)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('checkTreeLimit: DB が { count: null } を返したとき 0 扱いになり上限エラーが発生しないこと（free プラン, max_trees=1）', async () => {
    // free プラン (max_trees=1), count=null → current=0 → 0 < 1 なのでエラーなし
    const subscriptionResult = { data: null, error: null };
    const countResult = { count: null, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkTreeLimit(USER_ID)).resolves.toBeUndefined();
  });

  it('checkPersonLimit: DB が { count: null } を返したとき 0 扱いになり上限エラーが発生しないこと（free プラン, max_persons_per_tree=5）', async () => {
    // free プラン (max_persons_per_tree=5), count=null → current=0 → 0 < 5 なのでエラーなし
    const subscriptionResult = { data: null, error: null };
    const countResult = { count: null, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkPersonLimit(USER_ID, TREE_ID)).resolves.toBeUndefined();
  });

  it('checkPhotoLimit: DB が { count: null } を返したとき 0 扱いになり上限エラーが発生しないこと（free プラン, max_photos_per_person=2）', async () => {
    // free プラン (max_photos_per_person=2), count=null → current=0 → 0 < 2 なのでエラーなし
    const subscriptionResult = { data: null, error: null };
    const countResult = { count: null, error: null };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkPhotoLimit(USER_ID, PERSON_ID)).resolves.toBeUndefined();
  });
});

// ===========================================================================
// 不足ケース追加: count クエリ DBエラー時に通常 Error がスローされること
// ===========================================================================

describe('count クエリ DBエラー時は PlanLimitError ではなく Error がスローされること', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('checkTreeLimit: count クエリ DBエラー → Error がスローされ PlanLimitError ではないこと', async () => {
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: null, error: { message: 'connection error' } };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkTreeLimit(USER_ID)).rejects.toThrow(Error);
    await expect(checkTreeLimit(USER_ID)).rejects.not.toBeInstanceOf(PlanLimitError);
  });

  it('checkPersonLimit: count クエリ DBエラー → Error がスローされ PlanLimitError ではないこと', async () => {
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: null, error: { message: 'connection error' } };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkPersonLimit(USER_ID, TREE_ID)).rejects.toThrow(Error);
    await expect(checkPersonLimit(USER_ID, TREE_ID)).rejects.not.toBeInstanceOf(PlanLimitError);
  });

  it('checkPhotoLimit: count クエリ DBエラー → Error がスローされ PlanLimitError ではないこと', async () => {
    const subscriptionResult = { data: null, error: null }; // free プラン
    const countResult = { count: null, error: { message: 'connection error' } };
    const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(checkPhotoLimit(USER_ID, PERSON_ID)).rejects.toThrow(Error);
    await expect(checkPhotoLimit(USER_ID, PERSON_ID)).rejects.not.toBeInstanceOf(PlanLimitError);
  });
});

// ===========================================================================
// assertWithinLimit
// ===========================================================================

describe('assertWithinLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('kind: tree', () => {
    it('kind=tree → checkTreeLimit と同等の動作（上限未達でエラーなし）', async () => {
      // free プラン, 現在 0 件
      const subscriptionResult = { data: null, error: null };
      const countResult = { count: 0, error: null };
      const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
      mockCreateClient.mockResolvedValue(supabase as never);

      await expect(
        assertWithinLimit({ kind: 'tree', userId: USER_ID })
      ).resolves.toBeUndefined();
    });

    it('kind=tree → 上限超過で PlanLimitError がスローされること', async () => {
      // free プラン: max_trees=1, 現在 1 件
      const subscriptionResult = { data: null, error: null };
      const countResult = { count: 1, error: null };
      const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
      mockCreateClient.mockResolvedValue(supabase as never);

      let caughtError: PlanLimitError | null = null;
      try {
        await assertWithinLimit({ kind: 'tree', userId: USER_ID });
      } catch (e) {
        caughtError = e as PlanLimitError;
      }

      expect(caughtError).toBeInstanceOf(PlanLimitError);
      expect(caughtError!.info.resource).toBe('tree');
    });
  });

  describe('kind: person', () => {
    it('kind=person → checkPersonLimit と同等の動作（上限未達でエラーなし）', async () => {
      // free プラン: max_persons_per_tree=5, 現在 4 件
      const subscriptionResult = { data: null, error: null };
      const countResult = { count: 4, error: null };
      const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
      mockCreateClient.mockResolvedValue(supabase as never);

      await expect(
        assertWithinLimit({ kind: 'person', userId: USER_ID, treeId: TREE_ID })
      ).resolves.toBeUndefined();
    });

    it('kind=person → 上限超過で PlanLimitError がスローされること', async () => {
      // free プラン: max_persons_per_tree=5, 現在 5 件
      const subscriptionResult = { data: null, error: null };
      const countResult = { count: 5, error: null };
      const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
      mockCreateClient.mockResolvedValue(supabase as never);

      let caughtError: PlanLimitError | null = null;
      try {
        await assertWithinLimit({ kind: 'person', userId: USER_ID, treeId: TREE_ID });
      } catch (e) {
        caughtError = e as PlanLimitError;
      }

      expect(caughtError).toBeInstanceOf(PlanLimitError);
      expect(caughtError!.info.resource).toBe('person');
    });
  });

  describe('kind: photo', () => {
    it('kind=photo → checkPhotoLimit と同等の動作（上限未達でエラーなし）', async () => {
      // free プラン: max_photos_per_person=2, 現在 1 件
      const subscriptionResult = { data: null, error: null };
      const countResult = { count: 1, error: null };
      const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
      mockCreateClient.mockResolvedValue(supabase as never);

      await expect(
        assertWithinLimit({ kind: 'photo', userId: USER_ID, personId: PERSON_ID })
      ).resolves.toBeUndefined();
    });

    it('kind=photo → 上限超過で PlanLimitError がスローされること', async () => {
      // free プラン: max_photos_per_person=2, 現在 2 件
      const subscriptionResult = { data: null, error: null };
      const countResult = { count: 2, error: null };
      const supabase = buildSupabaseForCheckLimit(subscriptionResult, countResult);
      mockCreateClient.mockResolvedValue(supabase as never);

      let caughtError: PlanLimitError | null = null;
      try {
        await assertWithinLimit({ kind: 'photo', userId: USER_ID, personId: PERSON_ID });
      } catch (e) {
        caughtError = e as PlanLimitError;
      }

      expect(caughtError).toBeInstanceOf(PlanLimitError);
      expect(caughtError!.info.resource).toBe('photo');
    });
  });
});
