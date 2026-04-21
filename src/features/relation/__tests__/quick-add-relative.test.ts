/**
 * quickAddRelative Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・プラン上限・person+relation INSERT・
 * 循環参照チェック・手動ロールバック・revalidatePath を検証する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// next/cache をモック
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

// getServerSession をモック
jest.mock('@/lib/auth/session', () => ({
  getServerSession: jest.fn(),
}));

// Supabase クライアントをモック
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

// プラン上限チェックをモック
jest.mock('@/lib/plan/limits', () => ({
  PlanLimitError: class PlanLimitError extends Error {
    code = 'PLAN_LIMIT_EXCEEDED';
    constructor(message: string) {
      super(message);
      this.name = 'PlanLimitError';
    }
  },
  assertWithinLimit: jest.fn(),
}));

// 循環参照チェックをモック
jest.mock('@/lib/relation/cycle-check', () => ({
  checkAncestorLoop: jest.fn(),
}));

import { revalidatePath } from 'next/cache';
import { quickAddRelative } from '../actions/quick-add-relative';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { assertWithinLimit, PlanLimitError } from '@/lib/plan/limits';
import { checkAncestorLoop } from '@/lib/relation/cycle-check';

const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockAssertWithinLimit = assertWithinLimit as jest.MockedFunction<typeof assertWithinLimit>;
const mockCheckAncestorLoop = checkAncestorLoop as jest.MockedFunction<typeof checkAncestorLoop>;

// テスト用 UUID
const ORIGIN_PERSON_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const NEW_PERSON_ID    = 'aaaaaaaa-0000-0000-0000-000000000002';
const TREE_ID          = 'bbbbbbbb-0000-0000-0000-000000000001';
const USER_ID          = 'cccccccc-0000-0000-0000-000000000001';
const NEW_RELATION_ID  = 'dddddddd-0000-0000-0000-000000000001';

/** 最小限の personDraft */
const PERSON_DRAFT = {
  displayName: 'テスト 太郎',
};

/** 認証済みセッションをセットアップ */
function setupSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({ user: { id: userId }, session: null });
}

/**
 * ハッピーパスの Supabase モックを構築するユーティリティ。
 *
 * - from('person').select().eq().single() → originPerson
 * - from('tree').select().eq().eq().single() → tree
 * - from('person').insert().select().single() → newPerson
 * - from('relation').insert().select().single() → newRelation
 */
function buildHappyPathMock(options?: {
  newPersonId?: string;
  newRelationId?: string;
  personInsertError?: object | null;
  relationInsertError?: object | null;
}) {
  const {
    newPersonId = NEW_PERSON_ID,
    newRelationId = NEW_RELATION_ID,
    personInsertError = null,
    relationInsertError = null,
  } = options ?? {};

  const mockFrom = jest.fn();
  let callIndex = 0;

  mockFrom.mockImplementation((table: string) => {
    const currentIndex = ++callIndex;
    const chain: Record<string, unknown> = {};
    const singleFn = jest.fn();
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.insert = jest.fn(() => chain);
    chain.delete = jest.fn(() => chain);
    chain.single = singleFn;
    chain.maybeSingle = jest.fn();

    if (table === 'person' && currentIndex === 1) {
      // originPerson 取得
      singleFn.mockResolvedValue({
        data: { id: ORIGIN_PERSON_ID, tree_id: TREE_ID },
        error: null,
      });
    } else if (table === 'tree' && currentIndex === 2) {
      // tree 所有権確認
      singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
    } else if (table === 'person' && currentIndex === 3) {
      // person INSERT
      if (personInsertError) {
        singleFn.mockResolvedValue({ data: null, error: personInsertError });
      } else {
        singleFn.mockResolvedValue({ data: { id: newPersonId }, error: null });
        // INSERT チェーンを正しく設定
        const insertChain: Record<string, unknown> = {};
        insertChain.select = jest.fn(() => insertChain);
        insertChain.single = jest.fn().mockResolvedValue({
          data: { id: newPersonId },
          error: null,
        });
        chain.insert = jest.fn(() => insertChain);
      }
    } else if (table === 'relation' && currentIndex === 4) {
      // relation INSERT
      if (relationInsertError) {
        const insertChain: Record<string, unknown> = {};
        insertChain.select = jest.fn(() => insertChain);
        insertChain.single = jest.fn().mockResolvedValue({
          data: null,
          error: relationInsertError,
        });
        chain.insert = jest.fn(() => insertChain);
      } else {
        const insertChain: Record<string, unknown> = {};
        insertChain.select = jest.fn(() => insertChain);
        insertChain.single = jest.fn().mockResolvedValue({
          data: { id: newRelationId },
          error: null,
        });
        chain.insert = jest.fn(() => insertChain);
      }
    } else if (table === 'person' && currentIndex === 5) {
      // ロールバック用 DELETE
      const deleteChain: Record<string, unknown> = {};
      deleteChain.eq = jest.fn().mockImplementation(() => deleteChain);
      const result = { error: null };
      const p = Promise.resolve(result);
      Object.defineProperty(deleteChain, 'then', {
        get: () => p.then.bind(p),
        configurable: true,
      });
      Object.defineProperty(deleteChain, 'catch', {
        get: () => p.catch.bind(p),
        configurable: true,
      });
      Object.defineProperty(deleteChain, 'finally', {
        get: () => p.finally.bind(p),
        configurable: true,
      });
      chain.delete = jest.fn(() => deleteChain);
    }

    return chain;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return mockFrom;
}

describe('quickAddRelative', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // デフォルト: 循環なし・上限未達
    mockCheckAncestorLoop.mockResolvedValue(false);
    mockAssertWithinLimit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 未ログイン
  // -------------------------------------------------------------------------
  describe('未ログイン', () => {
    it('セッションが null の場合 UNAUTHENTICATED を返すこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const result = await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'parent',
        personDraft: PERSON_DRAFT,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // バリデーションエラー
  // -------------------------------------------------------------------------
  describe('バリデーションエラー', () => {
    beforeEach(() => {
      setupSession();
    });

    it('originPersonId が UUID でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await quickAddRelative({
        originPersonId: 'not-a-uuid',
        kind: 'parent',
        personDraft: PERSON_DRAFT,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('kind が無効な値の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'invalid_kind',
        personDraft: PERSON_DRAFT,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('personDraft.displayName が空の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'parent',
        personDraft: { displayName: '' },
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await quickAddRelative({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // originPerson 存在しない → NOT_FOUND
  // -------------------------------------------------------------------------
  describe('originPerson が存在しない', () => {
    it('originPerson が見つからない場合 NOT_FOUND を返すこと', async () => {
      setupSession();

      const mockFrom = jest.fn();
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        insert: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      const result = await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'parent',
        personDraft: PERSON_DRAFT,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 所有権なし → FORBIDDEN
  // -------------------------------------------------------------------------
  describe('所有権なし', () => {
    it('他人のツリーの人物の場合 FORBIDDEN を返すこと', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation(() => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.insert = jest.fn(() => chain);
        chain.delete = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (currentIndex === 1) {
          // originPerson 取得: 成功
          singleFn.mockResolvedValue({
            data: { id: ORIGIN_PERSON_ID, tree_id: TREE_ID },
            error: null,
          });
        } else if (currentIndex === 2) {
          // tree 所有権確認: 失敗
          singleFn.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      const result = await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'parent',
        personDraft: PERSON_DRAFT,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // プラン上限超過 → PLAN_LIMIT_EXCEEDED
  // -------------------------------------------------------------------------
  describe('プラン上限超過', () => {
    it('プラン上限に達している場合 PLAN_LIMIT_EXCEEDED を返すこと', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation(() => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.insert = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: ORIGIN_PERSON_ID, tree_id: TREE_ID },
            error: null,
          });
        } else if (currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
      mockAssertWithinLimit.mockRejectedValue(
        new PlanLimitError('プランの上限に達しています')
      );

      const result = await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'parent',
        personDraft: PERSON_DRAFT,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'PLAN_LIMIT_EXCEEDED' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 正常系: kind='parent'
  // -------------------------------------------------------------------------
  describe("正常系: kind='parent'", () => {
    it('親として人物+親子関係を作成して personId と relationId を返すこと', async () => {
      setupSession();
      buildHappyPathMock();

      const result = await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'parent',
        personDraft: PERSON_DRAFT,
      });

      expect(result).toEqual({
        ok: true,
        data: {
          personId: NEW_PERSON_ID,
          relationId: NEW_RELATION_ID,
        },
      });
    });

    it("kind='parent' の場合 checkAncestorLoop が呼ばれること", async () => {
      setupSession();
      buildHappyPathMock();

      await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'parent',
        personDraft: PERSON_DRAFT,
      });

      expect(mockCheckAncestorLoop).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 正常系: kind='child'
  // -------------------------------------------------------------------------
  describe("正常系: kind='child'", () => {
    it('子として人物+親子関係(逆方向)を作成して personId と relationId を返すこと', async () => {
      setupSession();
      buildHappyPathMock();

      const result = await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'child',
        personDraft: PERSON_DRAFT,
      });

      expect(result).toEqual({
        ok: true,
        data: {
          personId: NEW_PERSON_ID,
          relationId: NEW_RELATION_ID,
        },
      });
    });

    it("kind='child' の場合 checkAncestorLoop が呼ばれること", async () => {
      setupSession();
      buildHappyPathMock();

      await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'child',
        personDraft: PERSON_DRAFT,
      });

      expect(mockCheckAncestorLoop).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 正常系: kind='spouse'
  // -------------------------------------------------------------------------
  describe("正常系: kind='spouse'", () => {
    it('配偶者として人物+婚姻関係を作成して personId と relationId を返すこと', async () => {
      setupSession();
      buildHappyPathMock();

      const result = await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'spouse',
        personDraft: PERSON_DRAFT,
      });

      expect(result).toEqual({
        ok: true,
        data: {
          personId: NEW_PERSON_ID,
          relationId: NEW_RELATION_ID,
        },
      });
    });

    it("kind='spouse' の場合 checkAncestorLoop が呼ばれないこと", async () => {
      setupSession();
      buildHappyPathMock();

      await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'spouse',
        personDraft: PERSON_DRAFT,
      });

      expect(mockCheckAncestorLoop).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 循環参照検出 → RELATION_CONFLICT
  // -------------------------------------------------------------------------
  describe('循環参照検出', () => {
    it("kind='parent' で循環が検出された場合 RELATION_CONFLICT を返すこと", async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation((table: string) => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.insert = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (table === 'person' && currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: ORIGIN_PERSON_ID, tree_id: TREE_ID },
            error: null,
          });
        } else if (table === 'tree' && currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (table === 'person' && currentIndex === 3) {
          // person INSERT 成功
          const insertChain: Record<string, unknown> = {};
          insertChain.select = jest.fn(() => insertChain);
          insertChain.single = jest.fn().mockResolvedValue({
            data: { id: NEW_PERSON_ID },
            error: null,
          });
          chain.insert = jest.fn(() => insertChain);
        } else if (table === 'person' && currentIndex === 4) {
          // ロールバック DELETE
          const deleteChain: Record<string, unknown> = {};
          deleteChain.eq = jest.fn().mockImplementation(() => deleteChain);
          const result = { error: null };
          const p = Promise.resolve(result);
          Object.defineProperty(deleteChain, 'then', {
            get: () => p.then.bind(p),
            configurable: true,
          });
          Object.defineProperty(deleteChain, 'catch', {
            get: () => p.catch.bind(p),
            configurable: true,
          });
          Object.defineProperty(deleteChain, 'finally', {
            get: () => p.finally.bind(p),
            configurable: true,
          });
          chain.delete = jest.fn(() => deleteChain);
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
      mockCheckAncestorLoop.mockResolvedValue(true); // 循環あり

      const result = await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'parent',
        personDraft: PERSON_DRAFT,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'RELATION_CONFLICT' }),
      });
    });

    it("kind='child' で循環が検出された場合 RELATION_CONFLICT を返すこと", async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation((table: string) => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.insert = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (table === 'person' && currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: ORIGIN_PERSON_ID, tree_id: TREE_ID },
            error: null,
          });
        } else if (table === 'tree' && currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (table === 'person' && currentIndex === 3) {
          const insertChain: Record<string, unknown> = {};
          insertChain.select = jest.fn(() => insertChain);
          insertChain.single = jest.fn().mockResolvedValue({
            data: { id: NEW_PERSON_ID },
            error: null,
          });
          chain.insert = jest.fn(() => insertChain);
        } else if (table === 'person' && currentIndex === 4) {
          const deleteChain: Record<string, unknown> = {};
          deleteChain.eq = jest.fn().mockImplementation(() => deleteChain);
          const result = { error: null };
          const p = Promise.resolve(result);
          Object.defineProperty(deleteChain, 'then', {
            get: () => p.then.bind(p),
            configurable: true,
          });
          Object.defineProperty(deleteChain, 'catch', {
            get: () => p.catch.bind(p),
            configurable: true,
          });
          Object.defineProperty(deleteChain, 'finally', {
            get: () => p.finally.bind(p),
            configurable: true,
          });
          chain.delete = jest.fn(() => deleteChain);
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
      mockCheckAncestorLoop.mockResolvedValue(true);

      const result = await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'child',
        personDraft: PERSON_DRAFT,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'RELATION_CONFLICT' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // relation INSERT 失敗 → person が手動削除される (ロールバック)
  // -------------------------------------------------------------------------
  describe('relation INSERT 失敗時のロールバック', () => {
    it('relation INSERT 失敗時に作成した person を DELETE して INTERNAL_ERROR を返すこと', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;
      let deleteCalled = false;

      mockFrom.mockImplementation((table: string) => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.insert = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (table === 'person' && currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: ORIGIN_PERSON_ID, tree_id: TREE_ID },
            error: null,
          });
        } else if (table === 'tree' && currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (table === 'person' && currentIndex === 3) {
          // person INSERT 成功
          const insertChain: Record<string, unknown> = {};
          insertChain.select = jest.fn(() => insertChain);
          insertChain.single = jest.fn().mockResolvedValue({
            data: { id: NEW_PERSON_ID },
            error: null,
          });
          chain.insert = jest.fn(() => insertChain);
        } else if (table === 'relation' && currentIndex === 4) {
          // relation INSERT 失敗
          const insertChain: Record<string, unknown> = {};
          insertChain.select = jest.fn(() => insertChain);
          insertChain.single = jest.fn().mockResolvedValue({
            data: null,
            error: { code: '42000', message: 'insert error' },
          });
          chain.insert = jest.fn(() => insertChain);
        } else if (table === 'person' && currentIndex === 5) {
          // ロールバック DELETE
          deleteCalled = true;
          const deleteChain: Record<string, unknown> = {};
          let eqCount = 0;
          deleteChain.eq = jest.fn().mockImplementation(() => {
            eqCount++;
            if (eqCount >= 2) {
              const result = { error: null };
              const p = Promise.resolve(result);
              const terminal: Record<string, unknown> = {};
              Object.defineProperty(terminal, 'then', {
                get: () => p.then.bind(p),
                configurable: true,
              });
              Object.defineProperty(terminal, 'catch', {
                get: () => p.catch.bind(p),
                configurable: true,
              });
              Object.defineProperty(terminal, 'finally', {
                get: () => p.finally.bind(p),
                configurable: true,
              });
              return terminal;
            }
            return deleteChain;
          });
          chain.delete = jest.fn(() => deleteChain);
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      const result = await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'spouse',
        personDraft: PERSON_DRAFT,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
      expect(deleteCalled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // person INSERT 失敗 → INTERNAL_ERROR
  // -------------------------------------------------------------------------
  describe('person INSERT 失敗', () => {
    it('person INSERT 失敗時に INTERNAL_ERROR を返すこと', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation((table: string) => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.insert = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (table === 'person' && currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: ORIGIN_PERSON_ID, tree_id: TREE_ID },
            error: null,
          });
        } else if (table === 'tree' && currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (table === 'person' && currentIndex === 3) {
          // person INSERT 失敗
          const insertChain: Record<string, unknown> = {};
          insertChain.select = jest.fn(() => insertChain);
          insertChain.single = jest.fn().mockResolvedValue({
            data: null,
            error: { code: '42000', message: 'insert error' },
          });
          chain.insert = jest.fn(() => insertChain);
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      const result = await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'parent',
        personDraft: PERSON_DRAFT,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // revalidatePath 呼び出し
  // -------------------------------------------------------------------------
  describe('revalidatePath 呼び出し', () => {
    it('正常系で revalidatePath が呼ばれること', async () => {
      setupSession();
      buildHappyPathMock();

      await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'parent',
        personDraft: PERSON_DRAFT,
      });

      expect(mockRevalidatePath).toHaveBeenCalledWith(
        `/dashboard/trees/${TREE_ID}`
      );
    });
  });

  // -------------------------------------------------------------------------
  // 循環参照検出時のロールバック DELETE 呼び出し確認
  // -------------------------------------------------------------------------
  describe('循環参照検出時のロールバック DELETE', () => {
    it("kind='parent' で循環検出時にロールバック DELETE が呼ばれること", async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;
      let rollbackDeleteFn: jest.Mock | null = null;

      mockFrom.mockImplementation((table: string) => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.insert = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (table === 'person' && currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: ORIGIN_PERSON_ID, tree_id: TREE_ID },
            error: null,
          });
        } else if (table === 'tree' && currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (table === 'person' && currentIndex === 3) {
          // person INSERT 成功
          const insertChain: Record<string, unknown> = {};
          insertChain.select = jest.fn(() => insertChain);
          insertChain.single = jest.fn().mockResolvedValue({
            data: { id: NEW_PERSON_ID },
            error: null,
          });
          chain.insert = jest.fn(() => insertChain);
        } else if (table === 'person' && currentIndex === 4) {
          // ロールバック DELETE
          const deleteChain: Record<string, unknown> = {};
          const eqFn = jest.fn().mockReturnValue(deleteChain);
          deleteChain.eq = eqFn;
          const result = { error: null };
          const p = Promise.resolve(result);
          Object.defineProperty(deleteChain, 'then', {
            get: () => p.then.bind(p),
            configurable: true,
          });
          Object.defineProperty(deleteChain, 'catch', {
            get: () => p.catch.bind(p),
            configurable: true,
          });
          Object.defineProperty(deleteChain, 'finally', {
            get: () => p.finally.bind(p),
            configurable: true,
          });
          const deleteFn = jest.fn(() => deleteChain);
          rollbackDeleteFn = deleteFn;
          chain.delete = deleteFn;
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
      mockCheckAncestorLoop.mockResolvedValue(true); // 循環あり

      await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'parent',
        personDraft: PERSON_DRAFT,
      });

      // ロールバック DELETE が実際に呼ばれていること
      expect(rollbackDeleteFn).not.toBeNull();
      expect(rollbackDeleteFn).toHaveBeenCalled();
    });

    it("kind='child' で循環検出時にロールバック DELETE が呼ばれること", async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;
      let rollbackDeleteFn: jest.Mock | null = null;

      mockFrom.mockImplementation((table: string) => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.insert = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (table === 'person' && currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: ORIGIN_PERSON_ID, tree_id: TREE_ID },
            error: null,
          });
        } else if (table === 'tree' && currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (table === 'person' && currentIndex === 3) {
          // person INSERT 成功
          const insertChain: Record<string, unknown> = {};
          insertChain.select = jest.fn(() => insertChain);
          insertChain.single = jest.fn().mockResolvedValue({
            data: { id: NEW_PERSON_ID },
            error: null,
          });
          chain.insert = jest.fn(() => insertChain);
        } else if (table === 'person' && currentIndex === 4) {
          // ロールバック DELETE
          const deleteChain: Record<string, unknown> = {};
          const eqFn = jest.fn().mockReturnValue(deleteChain);
          deleteChain.eq = eqFn;
          const result = { error: null };
          const p = Promise.resolve(result);
          Object.defineProperty(deleteChain, 'then', {
            get: () => p.then.bind(p),
            configurable: true,
          });
          Object.defineProperty(deleteChain, 'catch', {
            get: () => p.catch.bind(p),
            configurable: true,
          });
          Object.defineProperty(deleteChain, 'finally', {
            get: () => p.finally.bind(p),
            configurable: true,
          });
          const deleteFn = jest.fn(() => deleteChain);
          rollbackDeleteFn = deleteFn;
          chain.delete = deleteFn;
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
      mockCheckAncestorLoop.mockResolvedValue(true); // 循環あり

      await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'child',
        personDraft: PERSON_DRAFT,
      });

      // ロールバック DELETE が実際に呼ばれていること
      expect(rollbackDeleteFn).not.toBeNull();
      expect(rollbackDeleteFn).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // assertWithinLimit が通常 Error をスロー → INTERNAL_ERROR
  // -------------------------------------------------------------------------
  describe('assertWithinLimit が通常 Error をスロー', () => {
    it('PlanLimitError 以外の Error がスローされた場合 INTERNAL_ERROR を返すこと', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation(() => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.insert = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: ORIGIN_PERSON_ID, tree_id: TREE_ID },
            error: null,
          });
        } else if (currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
      // PlanLimitError ではなく通常の Error をスロー
      mockAssertWithinLimit.mockRejectedValue(new Error('unexpected limit check failure'));

      const result = await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'parent',
        personDraft: PERSON_DRAFT,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // checkAncestorLoop の引数方向検証
  // -------------------------------------------------------------------------
  describe('checkAncestorLoop の引数順検証', () => {
    it("kind='parent' の場合 checkAncestorLoop(supabase, originPersonId, newPersonId, treeId) の順で呼ばれること", async () => {
      setupSession();
      buildHappyPathMock();

      await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'parent',
        personDraft: PERSON_DRAFT,
      });

      // kind='parent': originPerson が子、新規人物が親
      // checkAncestorLoop(supabase, originPersonId, newPersonId, treeId) の引数順
      expect(mockCheckAncestorLoop).toHaveBeenCalledWith(
        expect.anything(),  // supabase クライアント
        ORIGIN_PERSON_ID,   // 第2引数: originPersonId (子側)
        NEW_PERSON_ID,      // 第3引数: newPersonId (親側)
        TREE_ID             // 第4引数: treeId
      );
    });

    it("kind='child' の場合 checkAncestorLoop(supabase, newPersonId, originPersonId, treeId) の順で呼ばれること", async () => {
      setupSession();
      buildHappyPathMock();

      await quickAddRelative({
        originPersonId: ORIGIN_PERSON_ID,
        kind: 'child',
        personDraft: PERSON_DRAFT,
      });

      // kind='child': originPerson が親、新規人物が子
      // checkAncestorLoop(supabase, newPersonId, originPersonId, treeId) の引数順
      expect(mockCheckAncestorLoop).toHaveBeenCalledWith(
        expect.anything(),  // supabase クライアント
        NEW_PERSON_ID,      // 第2引数: newPersonId (子側)
        ORIGIN_PERSON_ID,   // 第3引数: originPersonId (親側)
        TREE_ID             // 第4引数: treeId
      );
    });
  });
});
