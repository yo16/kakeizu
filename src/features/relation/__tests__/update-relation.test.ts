/**
 * updateRelation Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・UPDATE・revalidatePath を検証する。
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
import { updateRelation } from '../actions/update-relation';
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
 * Supabase from() チェーンを呼び出し順で制御するモックをセットアップする。
 * handlers は呼び出しインデックスをキーにした設定オブジェクト。
 */
function setupFromMock(
  handlers: Record<number, (chain: Record<string, unknown>, singleFn: jest.Mock) => void>
) {
  const mockFrom = jest.fn();
  let callIndex = 0;

  mockFrom.mockImplementation(() => {
    const currentIndex = ++callIndex;
    const chain: Record<string, unknown> = {};
    const singleFn = jest.fn();
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.update = jest.fn(() => chain);
    chain.delete = jest.fn(() => chain);
    chain.insert = jest.fn(() => chain);
    chain.single = singleFn;
    chain.maybeSingle = jest.fn();

    const handler = handlers[currentIndex];
    if (handler) {
      handler(chain, singleFn);
    }

    return chain;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return mockFrom;
}

describe('updateRelation', () => {
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

      const result = await updateRelation({
        relationId: RELATION_ID,
        kind: 'parent_child',
        parentRole: 'biological',
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

    it('relationId が UUID でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await updateRelation({
        relationId: 'not-a-uuid',
        kind: 'parent_child',
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('kind が無効な値の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await updateRelation({
        relationId: RELATION_ID,
        kind: 'invalid_kind',
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await updateRelation({});

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

      const result = await updateRelation({
        relationId: RELATION_ID,
        kind: 'parent_child',
        parentRole: 'biological',
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
    it('他人のツリーの relation の場合 FORBIDDEN を返すこと', async () => {
      setupSession();
      setupFromMock({
        1: (_, singleFn) => {
          // relation 取得: 成功 (kind 一致)
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID, kind: 'parent_child' },
            error: null,
          });
        },
        2: (_, singleFn) => {
          // tree 所有権確認: 失敗
          singleFn.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
        },
      });

      const result = await updateRelation({
        relationId: RELATION_ID,
        kind: 'parent_child',
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // kind スキーマと DB の kind が不一致 → VALIDATION_ERROR
  // -------------------------------------------------------------------------
  describe('kind 不一致', () => {
    it('入力 kind=parent_child だが DB の kind=marriage の場合 VALIDATION_ERROR を返すこと', async () => {
      setupSession();
      setupFromMock({
        1: (_, singleFn) => {
          // relation の kind が marriage
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID, kind: 'marriage' },
            error: null,
          });
        },
      });

      const result = await updateRelation({
        relationId: RELATION_ID,
        kind: 'parent_child',
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR', field: 'kind' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 正常系: parent_child の parentRole 更新
  // -------------------------------------------------------------------------
  describe('正常系: parent_child 更新', () => {
    it('parentRole を更新して ok:true を返すこと', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation(() => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.update = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (currentIndex === 1) {
          // relation 取得
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID, kind: 'parent_child' },
            error: null,
          });
        } else if (currentIndex === 2) {
          // tree 所有権確認
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (currentIndex === 3) {
          // UPDATE → select('id') の結果
          singleFn.mockResolvedValue({ data: { id: RELATION_ID }, error: null });
          // update チェーン: update → eq → eq → select → 配列を返す
          chain.update = jest.fn(() => {
            const updateChain: Record<string, unknown> = {};
            updateChain.eq = jest.fn(() => updateChain);
            updateChain.select = jest.fn().mockResolvedValue({
              data: [{ id: RELATION_ID }],
              error: null,
            });
            return updateChain;
          });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      const result = await updateRelation({
        relationId: RELATION_ID,
        kind: 'parent_child',
        parentRole: 'adoptive',
      });

      expect(result).toEqual({ ok: true, data: undefined });
    });
  });

  // -------------------------------------------------------------------------
  // 正常系: marriage の type/status/年月更新
  // -------------------------------------------------------------------------
  describe('正常系: marriage 更新', () => {
    it('marriage の type, status, startYear を更新して ok:true を返すこと', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation(() => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.update = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID, kind: 'marriage' },
            error: null,
          });
        } else if (currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (currentIndex === 3) {
          chain.update = jest.fn(() => {
            const updateChain: Record<string, unknown> = {};
            updateChain.eq = jest.fn(() => updateChain);
            updateChain.select = jest.fn().mockResolvedValue({
              data: [{ id: RELATION_ID }],
              error: null,
            });
            return updateChain;
          });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      const result = await updateRelation({
        relationId: RELATION_ID,
        kind: 'marriage',
        type: 'common_law',
        status: 'divorced',
        startYear: 2000,
      });

      expect(result).toEqual({ ok: true, data: undefined });
    });
  });

  // -------------------------------------------------------------------------
  // UPDATE の tree_id フィルタ
  // -------------------------------------------------------------------------
  describe('UPDATE クエリの tree_id フィルタ', () => {
    it('UPDATE クエリで tree_id が eq 条件に含まれること', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;
      let capturedUpdateEqCalls: Array<[string, unknown]> = [];

      mockFrom.mockImplementation(() => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.update = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID, kind: 'parent_child' },
            error: null,
          });
        } else if (currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (currentIndex === 3) {
          const eqFn = jest.fn().mockImplementation((...args: [string, unknown]) => {
            capturedUpdateEqCalls.push(args);
            return updateChain;
          });
          const updateChain: Record<string, unknown> = {};
          updateChain.eq = eqFn;
          updateChain.select = jest.fn().mockResolvedValue({
            data: [{ id: RELATION_ID }],
            error: null,
          });
          chain.update = jest.fn(() => updateChain);
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      await updateRelation({
        relationId: RELATION_ID,
        kind: 'parent_child',
        parentRole: 'biological',
      });

      // UPDATE チェーンに tree_id フィルタが含まれること
      const treeIdCall = capturedUpdateEqCalls.find(([key]) => key === 'tree_id');
      expect(treeIdCall).toBeDefined();
      expect(treeIdCall?.[1]).toBe(TREE_ID);
    });
  });

  // -------------------------------------------------------------------------
  // UPDATE 結果が 0 件 → INTERNAL_ERROR
  // -------------------------------------------------------------------------
  describe('UPDATE 結果が 0 件', () => {
    it('updated が空配列の場合 NOT_FOUND を返すこと', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation(() => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.update = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID, kind: 'parent_child' },
            error: null,
          });
        } else if (currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (currentIndex === 3) {
          chain.update = jest.fn(() => {
            const updateChain: Record<string, unknown> = {};
            updateChain.eq = jest.fn(() => updateChain);
            // 0 件
            updateChain.select = jest.fn().mockResolvedValue({
              data: [],
              error: null,
            });
            return updateChain;
          });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      const result = await updateRelation({
        relationId: RELATION_ID,
        kind: 'parent_child',
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 空 patch (kind=parent_child, parentRole/note 両方未指定) → VALIDATION_ERROR
  // -------------------------------------------------------------------------
  describe('空 patch', () => {
    it('kind=parent_child かつ parentRole も note も未指定の場合 VALIDATION_ERROR を返すこと', async () => {
      setupSession();
      setupFromMock({
        1: (_, singleFn) => {
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID, kind: 'parent_child' },
            error: null,
          });
        },
        2: (_, singleFn) => {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        },
      });

      // kind=parent_child のみ指定、parentRole も note も省略
      const result = await updateRelation({
        relationId: RELATION_ID,
        kind: 'parent_child',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // UPDATE エラー時 → INTERNAL_ERROR
  // -------------------------------------------------------------------------
  describe('UPDATE エラー', () => {
    it('UPDATE クエリがエラーを返した場合 INTERNAL_ERROR を返すこと', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation(() => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.update = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID, kind: 'parent_child' },
            error: null,
          });
        } else if (currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (currentIndex === 3) {
          // UPDATE チェーンがエラーを返す
          chain.update = jest.fn(() => {
            const updateChain: Record<string, unknown> = {};
            updateChain.eq = jest.fn(() => updateChain);
            updateChain.select = jest.fn().mockResolvedValue({
              data: null,
              error: { code: '42000', message: 'update failed' },
            });
            return updateChain;
          });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      const result = await updateRelation({
        relationId: RELATION_ID,
        kind: 'parent_child',
        parentRole: 'biological',
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
    it('更新成功時に revalidatePath が呼ばれること', async () => {
      setupSession();

      const mockFrom = jest.fn();
      let callIndex = 0;

      mockFrom.mockImplementation(() => {
        const currentIndex = ++callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.update = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();

        if (currentIndex === 1) {
          singleFn.mockResolvedValue({
            data: { id: RELATION_ID, tree_id: TREE_ID, kind: 'parent_child' },
            error: null,
          });
        } else if (currentIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (currentIndex === 3) {
          chain.update = jest.fn(() => {
            const updateChain: Record<string, unknown> = {};
            updateChain.eq = jest.fn(() => updateChain);
            updateChain.select = jest.fn().mockResolvedValue({
              data: [{ id: RELATION_ID }],
              error: null,
            });
            return updateChain;
          });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      await updateRelation({
        relationId: RELATION_ID,
        kind: 'parent_child',
        parentRole: 'biological',
      });

      expect(mockRevalidatePath).toHaveBeenCalledWith(
        `/dashboard/trees/${TREE_ID}`
      );
    });
  });
});
