/**
 * deleteRelation Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・DELETE・revalidatePath を検証する。
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

import { revalidatePath } from 'next/cache';
import { deleteRelation } from '../actions/delete-relation';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// テスト用 UUID
const RELATION_ID = 'eeeeeeee-0000-0000-0000-000000000001';
const TREE_ID     = 'bbbbbbbb-0000-0000-0000-000000000001';
const USER_ID     = 'cccccccc-0000-0000-0000-000000000001';

/** 認証済みセッションをセットアップ */
function setupSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({ user: { id: userId }, session: null });
}

/**
 * 各 from() 呼び出しをインデックスで制御するモックを構築する。
 * handlers[index] が呼び出しごとに chain と singleFn をカスタマイズできる。
 */
function setupFromMock(
  handlers: Record<
    number,
    (chain: Record<string, unknown>, singleFn: jest.Mock, deleteFn: jest.Mock) => void
  >
) {
  const mockFrom = jest.fn();
  let callIndex = 0;

  mockFrom.mockImplementation(() => {
    const currentIndex = ++callIndex;
    const chain: Record<string, unknown> = {};
    const singleFn = jest.fn();
    const deleteFn = jest.fn(() => chain);
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.delete = deleteFn;
    chain.single = singleFn;
    chain.maybeSingle = jest.fn();

    const handler = handlers[currentIndex];
    if (handler) {
      handler(chain, singleFn, deleteFn);
    }

    return chain;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return mockFrom;
}

describe('deleteRelation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
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

      const result = await deleteRelation({ relationId: RELATION_ID });

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

    it('relationId が UUID でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await deleteRelation({ relationId: 'not-a-uuid' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('relationId が省略された場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await deleteRelation({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 存在しない relation → NOT_FOUND
  // -------------------------------------------------------------------------
  describe('存在しない relation', () => {
    it('relation が見つからない場合 NOT_FOUND を返すこと', async () => {
      setupSession();
      setupFromMock({
        1: (_, singleFn) => {
          singleFn.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
        },
      });

      const result = await deleteRelation({ relationId: RELATION_ID });

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
    it('他人のツリーの relation の場合 FORBIDDEN を返すこと', async () => {
      setupSession();
      setupFromMock({
        1: (_, singleFn) => {
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID },
            error: null,
          });
        },
        2: (_, singleFn) => {
          // tree 所有権確認: 失敗
          singleFn.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
        },
      });

      const result = await deleteRelation({ relationId: RELATION_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 正常系: 削除成功
  // -------------------------------------------------------------------------
  describe('正常系', () => {
    it('正常に削除できた場合 ok:true を返すこと', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation(() => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (currentIndex === 1) {
          // relation 取得
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID },
            error: null,
          });
        } else if (currentIndex === 2) {
          // tree 所有権確認
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (currentIndex === 3) {
          // DELETE チェーン: delete({ count: 'exact' }) → eq → eq → 結果
          chain.delete = jest.fn(() => {
            const deleteChain: Record<string, unknown> = {};
            deleteChain.eq = jest.fn().mockImplementation(() => deleteChain);
            // 最後の eq の後に Promise が解決される (直接 await)
            // eq チェーンを 2 回呼ぶ実装に合わせ、2 回目の eq 結果が Promise になる
            let eqCount = 0;
            const eqFn = jest.fn().mockImplementation(() => {
              eqCount++;
              if (eqCount >= 2) {
                // 2 回目の eq で終端 Promise を返す
                const result = { error: null, count: 1 };
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
            deleteChain.eq = eqFn;
            return deleteChain;
          });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      const result = await deleteRelation({ relationId: RELATION_ID });

      expect(result).toEqual({ ok: true, data: undefined });
    });
  });

  // -------------------------------------------------------------------------
  // DELETE の tree_id フィルタ
  // -------------------------------------------------------------------------
  describe('DELETE クエリの tree_id フィルタ', () => {
    it('DELETE クエリで tree_id が eq 条件に含まれること', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;
      const capturedDeleteEqCalls: Array<[string, unknown]> = [];

      mockFrom.mockImplementation(() => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID },
            error: null,
          });
        } else if (currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (currentIndex === 3) {
          chain.delete = jest.fn(() => {
            const deleteChain: Record<string, unknown> = {};
            let eqCount = 0;
            const eqFn = jest.fn().mockImplementation((key: string, value: unknown) => {
              capturedDeleteEqCalls.push([key, value]);
              eqCount++;
              if (eqCount >= 2) {
                const result = { error: null, count: 1 };
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
            deleteChain.eq = eqFn;
            return deleteChain;
          });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      await deleteRelation({ relationId: RELATION_ID });

      const treeIdCall = capturedDeleteEqCalls.find(([key]) => key === 'tree_id');
      expect(treeIdCall).toBeDefined();
      expect(treeIdCall?.[1]).toBe(TREE_ID);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE エラー時 → INTERNAL_ERROR
  // -------------------------------------------------------------------------
  describe('DELETE エラー', () => {
    it('DELETE クエリがエラーを返した場合 INTERNAL_ERROR を返すこと', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation(() => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID },
            error: null,
          });
        } else if (currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (currentIndex === 3) {
          // DELETE チェーンがエラーを返す
          chain.delete = jest.fn(() => {
            const deleteChain: Record<string, unknown> = {};
            let eqCount = 0;
            deleteChain.eq = jest.fn().mockImplementation(() => {
              eqCount++;
              if (eqCount >= 2) {
                const result = { error: { code: '42000', message: 'delete failed' }, count: null };
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
            return deleteChain;
          });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      const result = await deleteRelation({ relationId: RELATION_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // DELETE count 0 → NOT_FOUND
  // -------------------------------------------------------------------------
  describe('DELETE count 0', () => {
    it('count が 0 の場合 NOT_FOUND を返すこと', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation(() => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID },
            error: null,
          });
        } else if (currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (currentIndex === 3) {
          chain.delete = jest.fn(() => {
            const deleteChain: Record<string, unknown> = {};
            let eqCount = 0;
            deleteChain.eq = jest.fn().mockImplementation(() => {
              eqCount++;
              if (eqCount >= 2) {
                const result = { error: null, count: 0 };
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
            return deleteChain;
          });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      const result = await deleteRelation({ relationId: RELATION_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // revalidatePath 呼び出し
  // -------------------------------------------------------------------------
  describe('revalidatePath 呼び出し', () => {
    it('削除成功時に revalidatePath が呼ばれること', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation(() => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID },
            error: null,
          });
        } else if (currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (currentIndex === 3) {
          chain.delete = jest.fn(() => {
            const deleteChain: Record<string, unknown> = {};
            let eqCount = 0;
            deleteChain.eq = jest.fn().mockImplementation(() => {
              eqCount++;
              if (eqCount >= 2) {
                const result = { error: null, count: 1 };
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
            return deleteChain;
          });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      await deleteRelation({ relationId: RELATION_ID });

      expect(mockRevalidatePath).toHaveBeenCalledWith(
        `/dashboard/trees/${TREE_ID}`
      );
    });
  });
});
