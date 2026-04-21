/**
 * createParentChild Server Action のユニットテスト
 *
 * @/lib/auth/session の getServerSession と
 * @/lib/supabase/server の createClient をモックして、
 * バリデーション・認証・所有権確認・循環参照チェック・INSERT を検証する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// getServerSession をモック
jest.mock('@/lib/auth/session', () => ({
  getServerSession: jest.fn(),
}));

// Supabase クライアントのクエリビルダチェーンをモック
// from() → select() → eq() → ... → single()/maybeSingle() の各段階をモック
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { createParentChild } from '../actions/create-parent-child';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

// ホイスト問題を回避: import 後にキャストして取得
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// BFS 内の relation クエリ (eq チェーン 3 段 → data のみ返す) とその他の eq チェーンを区別するため
// テスト内で都度 mockImplementation を設定する方式にする。
// ここでは共通のビルダを用意し、各 from() 呼び出しでアサートできるようにする。

const buildEqChain = (terminal: jest.Mock) => {
  const chain: Record<string, unknown> = {};
  const eq = jest.fn(() => chain);
  chain.eq = eq;
  chain.select = jest.fn(() => chain);
  chain.insert = jest.fn(() => chain);
  chain.order = jest.fn(() => chain);
  chain.single = terminal;
  chain.maybeSingle = terminal;
  return { chain, eq };
};

// 各テーブルごとにモックを保持できるよう、from の戻り値を制御する
const mockFrom = jest.fn();

// テスト用 UUID
const PARENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CHILD_ID  = 'aaaaaaaa-0000-0000-0000-000000000002';
const TREE_ID   = 'bbbbbbbb-0000-0000-0000-000000000001';
const USER_ID   = 'cccccccc-0000-0000-0000-000000000001';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  });
}

/** 正常系の Supabase クエリを設定するヘルパー */
function setupHappyPathQueries(options?: { existingRelation?: boolean; bfsChildren?: string[] }) {
  const { existingRelation = false, bfsChildren = [] } = options ?? {};

  // from() の戻り値を呼び出し順にキューで制御する
  let callIndex = 0;
  mockFrom.mockImplementation((table: string) => {
    callIndex++;
    const currentCall = callIndex;

    // select チェーンの末端関数
    const singleFn = jest.fn();
    const maybeSingleFn = jest.fn();

    const chain: Record<string, unknown> = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.insert = jest.fn(() => chain);
    chain.order = jest.fn(() => chain);
    chain.single = singleFn;
    chain.maybeSingle = maybeSingleFn;

    if (table === 'person' && currentCall === 1) {
      // 親人物のツリーID取得
      singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
    } else if (table === 'tree' && currentCall === 2) {
      // ツリー所有権確認
      singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
    } else if (table === 'person' && currentCall === 3) {
      // 子人物の同一ツリー確認
      singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
    } else if (table === 'relation' && currentCall === 4) {
      // 重複チェック (maybeSingle)
      maybeSingleFn.mockResolvedValue({ data: existingRelation ? { id: 'rel-001' } : null });
    } else if (table === 'relation' && currentCall === 5) {
      // BFS: startPersonId の子を取得
      (chain as Record<string, unknown>).select = jest.fn(() => chain);
      (chain as Record<string, unknown>).eq = jest.fn(() => chain);
      // BFS の最終クエリは data を返す (single でも maybeSingle でもない)
      (chain as Record<string, unknown>).then = undefined;
      // BFS はクエリを直接 await するため Promise 化する
      Object.assign(chain, Promise.resolve({ data: bfsChildren.map((id) => ({ to_person_id: id })) }));
    } else if (table === 'relation' && currentCall >= 6) {
      // BFS の追加反復
      Object.assign(chain, Promise.resolve({ data: [] }));
    } else if (table === 'relation') {
      // INSERT
      const insertChain: Record<string, unknown> = {};
      insertChain.select = jest.fn(() => insertChain);
      insertChain.single = jest.fn().mockResolvedValue({ data: { id: 'new-relation-id' }, error: null });
      chain.insert = jest.fn(() => insertChain);
    }

    return chain;
  });
}

describe('createParentChild', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 認証エラー
  // -------------------------------------------------------------------------
  describe('未ログイン', () => {
    it('セッションが null の場合 UNAUTHENTICATED を返すこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await createParentChild({ parentId: PARENT_ID, childId: CHILD_ID, parentRole: 'biological' });

      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // バリデーションエラー
  // -------------------------------------------------------------------------
  describe('バリデーションエラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('parentId が UUID でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createParentChild({
        parentId: 'not-a-uuid',
        childId: CHILD_ID,
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('childId が UUID でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: 'not-a-uuid',
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('parentRole が無効な値の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'invalid_role',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createParentChild({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await createParentChild({ parentId: 'bad', childId: CHILD_ID, parentRole: 'biological' });

      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('parentId === childId の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: PARENT_ID,
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR', field: 'childId' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 親人物が存在しない
  // -------------------------------------------------------------------------
  describe('親人物が見つからない', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('親人物が存在しない場合 NOT_FOUND を返すこと', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        maybeSingle: jest.fn(),
        insert: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      });

      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // ツリー所有権確認 (FORBIDDEN)
  // -------------------------------------------------------------------------
  describe('他人のツリーへのアクセス', () => {
    it('他人のツリーの人物の場合 FORBIDDEN を返すこと', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation(() => {
        callIndex++;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();
        chain.insert = jest.fn(() => chain);
        chain.order = jest.fn(() => chain);

        if (callIndex === 1) {
          // 親人物のツリーID取得は成功
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 2) {
          // ツリー所有権確認で失敗 (他人のツリー)
          singleFn.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
        }

        return chain;
      });

      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 子人物が別のツリー (NOT_FOUND)
  // -------------------------------------------------------------------------
  describe('子人物が別のツリー', () => {
    it('子人物が別のツリーに属する場合 NOT_FOUND を返すこと', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation(() => {
        callIndex++;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();
        chain.insert = jest.fn(() => chain);
        chain.order = jest.fn(() => chain);

        if (callIndex === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (callIndex === 3) {
          // 子人物が同一ツリーにない
          singleFn.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
        }

        return chain;
      });

      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 重複関係 (RELATION_CONFLICT)
  // -------------------------------------------------------------------------
  describe('重複する親子関係', () => {
    it('同じ親子関係が既に存在する場合 RELATION_CONFLICT を返すこと', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation(() => {
        callIndex++;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        const maybeSingleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = maybeSingleFn;
        chain.insert = jest.fn(() => chain);
        chain.order = jest.fn(() => chain);

        if (callIndex === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (callIndex === 3) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 4) {
          // 重複チェック: 既存あり
          maybeSingleFn.mockResolvedValue({ data: { id: 'existing-rel' } });
        }

        return chain;
      });

      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'RELATION_CONFLICT' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 循環参照チェック (RELATION_CONFLICT)
  // -------------------------------------------------------------------------
  describe('循環参照チェック', () => {
    it('A→B が既にあり B→A を作ろうとすると RELATION_CONFLICT を返すこと', async () => {
      setupAuthenticatedSession();
      // B の子として A が返される → 循環検出

      let callIndex = 0;
      mockFrom.mockImplementation((table: string) => {
        callIndex++;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        const maybeSingleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = maybeSingleFn;
        chain.order = jest.fn(() => chain);
        // 循環検出により INSERT には到達しないが、万が一到達しても
        // "insert is not a function" エラーを防ぐためにスタブを定義する
        chain.insert = jest.fn(() => chain);

        // BFS クエリは Promise として直接 await される
        let promiseResolve: ((v: unknown) => void) | undefined;
        const promise = new Promise((resolve) => { promiseResolve = resolve; });
        Object.defineProperty(chain, 'then', {
          get: () => promise.then.bind(promise),
          configurable: true,
        });

        if (table === 'person' && callIndex === 1) {
          // 「parentId=B, childId=A」のケース: 親(B)のツリーID取得
          // ここでは PARENT_ID = B (CHILD_ID = A) として設定
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'tree' && callIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'person' && callIndex === 3) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && callIndex === 4) {
          // 重複チェック: 既存なし
          maybeSingleFn.mockResolvedValue({ data: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && callIndex === 5) {
          // BFS: childId (A = PARENT_ID) の子として parentId (B = CHILD_ID) が返る → 循環検出
          // startPersonId=PARENT_ID(A) の子として CHILD_ID(B) が返ることで
          // targetPersonId=CHILD_ID(B) と一致し、循環が検出される
          promiseResolve!({ data: [{ to_person_id: CHILD_ID }] });
        } else {
          promiseResolve!(undefined);
        }

        return chain;
      });

      // B→A の作成を試みる (A が B の子として既に存在)
      // parentId=CHILD_ID(B), childId=PARENT_ID(A)
      // BFS は childId=A の子孫に parentId=B が含まれるか探索する
      // A の子として B が返るため循環を検出する
      const result = await createParentChild({
        parentId: CHILD_ID,  // B
        childId: PARENT_ID,  // A (B の子)
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'RELATION_CONFLICT' }),
      });
    });

    it('A→B→C が既にあり C→A を作ろうとすると RELATION_CONFLICT を返すこと', async () => {
      setupAuthenticatedSession();

      const A_ID = 'aaaaaaaa-0000-0000-0000-000000000010';
      const B_ID = 'aaaaaaaa-0000-0000-0000-000000000011';
      const C_ID = 'aaaaaaaa-0000-0000-0000-000000000012';

      let callIndex = 0;
      mockFrom.mockImplementation((table: string) => {
        callIndex++;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        const maybeSingleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = maybeSingleFn;
        chain.order = jest.fn(() => chain);

        let promiseResolve: ((v: unknown) => void) | undefined;
        const promise = new Promise((resolve) => { promiseResolve = resolve; });
        Object.defineProperty(chain, 'then', {
          get: () => promise.then.bind(promise),
          configurable: true,
        });

        if (table === 'person' && callIndex === 1) {
          // C のツリーID取得 (parentId = C)
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'tree' && callIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'person' && callIndex === 3) {
          // childId = A が同一ツリー
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && callIndex === 4) {
          // 重複チェック: なし
          maybeSingleFn.mockResolvedValue({ data: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && callIndex === 5) {
          // BFS 1回目: A の子 → B
          promiseResolve!({ data: [{ to_person_id: B_ID }] });
        } else if (table === 'relation' && callIndex === 6) {
          // BFS 2回目: B の子 → C (= targetPersonId = C) → 循環検出
          promiseResolve!({ data: [{ to_person_id: C_ID }] });
        } else {
          promiseResolve!({ data: [] });
        }

        return chain;
      });

      // C → A を作ろうとする (A→B→C が既存)
      const result = await createParentChild({
        parentId: C_ID,
        childId: A_ID,
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'RELATION_CONFLICT' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // DB UNIQUE 制約違反 (RELATION_CONFLICT)
  // -------------------------------------------------------------------------
  describe('DB UNIQUE 制約違反', () => {
    it('INSERT 時に 23505 エラーが返る場合 RELATION_CONFLICT を返すこと', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation((table: string) => {
        callIndex++;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        const maybeSingleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = maybeSingleFn;
        chain.order = jest.fn(() => chain);

        let promiseResolve: ((v: unknown) => void) | undefined;
        const promise = new Promise((resolve) => { promiseResolve = resolve; });
        Object.defineProperty(chain, 'then', {
          get: () => promise.then.bind(promise),
          configurable: true,
        });

        if (table === 'person' && callIndex === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'tree' && callIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'person' && callIndex === 3) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && callIndex === 4) {
          maybeSingleFn.mockResolvedValue({ data: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && callIndex === 5) {
          // BFS: 子なし
          promiseResolve!({ data: [] });
        } else if (table === 'relation' && callIndex === 6) {
          // INSERT チェーン: insert → select → single
          const insertSelectChain: Record<string, unknown> = {};
          const insertSingle = jest.fn().mockResolvedValue({
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          });
          insertSelectChain.single = insertSingle;
          chain.insert = jest.fn(() => ({ select: jest.fn(() => insertSelectChain) }));
          promiseResolve!(undefined);
        } else {
          promiseResolve!(undefined);
        }

        return chain;
      });

      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'RELATION_CONFLICT' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // INSERT エラー (INTERNAL_ERROR)
  // -------------------------------------------------------------------------
  describe('INSERT エラー', () => {
    it('INSERT でその他エラーが発生した場合 INTERNAL_ERROR を返すこと', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation((table: string) => {
        callIndex++;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        const maybeSingleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = maybeSingleFn;
        chain.order = jest.fn(() => chain);

        let promiseResolve: ((v: unknown) => void) | undefined;
        const promise = new Promise((resolve) => { promiseResolve = resolve; });
        Object.defineProperty(chain, 'then', {
          get: () => promise.then.bind(promise),
          configurable: true,
        });

        if (table === 'person' && callIndex === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'tree' && callIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'person' && callIndex === 3) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && callIndex === 4) {
          maybeSingleFn.mockResolvedValue({ data: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && callIndex === 5) {
          promiseResolve!({ data: [] });
        } else if (table === 'relation' && callIndex === 6) {
          const insertSelectChain: Record<string, unknown> = {};
          const insertSingle = jest.fn().mockResolvedValue({
            data: null,
            error: { code: '42000', message: 'syntax error' },
          });
          insertSelectChain.single = insertSingle;
          chain.insert = jest.fn(() => ({ select: jest.fn(() => insertSelectChain) }));
          promiseResolve!(undefined);
        } else {
          promiseResolve!(undefined);
        }

        return chain;
      });

      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 正常系
  // -------------------------------------------------------------------------
  describe('正常系', () => {
    function setupSuccessfulQueries(options?: { note?: string }) {
      let callIndex = 0;
      mockFrom.mockImplementation((table: string) => {
        callIndex++;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        const maybeSingleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = maybeSingleFn;
        chain.order = jest.fn(() => chain);

        let promiseResolve: ((v: unknown) => void) | undefined;
        const promise = new Promise((resolve) => { promiseResolve = resolve; });
        Object.defineProperty(chain, 'then', {
          get: () => promise.then.bind(promise),
          configurable: true,
        });

        if (table === 'person' && callIndex === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'tree' && callIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'person' && callIndex === 3) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && callIndex === 4) {
          maybeSingleFn.mockResolvedValue({ data: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && callIndex === 5) {
          // BFS: 子なし
          promiseResolve!({ data: [] });
        } else if (table === 'relation' && callIndex === 6) {
          // INSERT
          const insertSelectChain: Record<string, unknown> = {};
          insertSelectChain.single = jest.fn().mockResolvedValue({
            data: { id: 'new-relation-id' },
            error: null,
          });
          chain.insert = jest.fn(() => ({ select: jest.fn(() => insertSelectChain) }));
          promiseResolve!(undefined);
        } else {
          promiseResolve!(undefined);
        }

        return chain;
      });
    }

    it('認証済み・自分のツリーの2人物で関係作成が成功し relationId を返すこと', async () => {
      setupAuthenticatedSession();
      setupSuccessfulQueries();

      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: true,
        data: { relationId: 'new-relation-id' },
      });
    });

    it('note 付きで関係作成が成功すること', async () => {
      setupAuthenticatedSession();
      setupSuccessfulQueries({ note: 'テストメモ' });

      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'biological',
        note: 'テストメモ',
      });

      expect(result).toEqual({
        ok: true,
        data: { relationId: 'new-relation-id' },
      });
    });

    it('parentRole が adoptive でも成功すること', async () => {
      setupAuthenticatedSession();
      setupSuccessfulQueries();

      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'adoptive',
      });

      expect(result).toEqual({
        ok: true,
        data: { relationId: 'new-relation-id' },
      });
    });

    it('parentRole が step でも成功すること', async () => {
      setupAuthenticatedSession();
      setupSuccessfulQueries();

      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'step',
      });

      expect(result).toEqual({
        ok: true,
        data: { relationId: 'new-relation-id' },
      });
    });
  });

  // -------------------------------------------------------------------------
  // 正常系: owner_user_id アサーション
  // -------------------------------------------------------------------------
  describe('正常系: ツリー所有権クエリの owner_user_id 引数検証', () => {
    it('ツリー所有権確認クエリで eq("owner_user_id", userId) が呼ばれること', async () => {
      setupAuthenticatedSession(USER_ID);

      // 各 from() 呼び出しの eq モックを記録できるようにする
      const eqCallsPerFrom: jest.Mock[][] = [];

      let callIndex = 0;
      mockFrom.mockImplementation((table: string) => {
        callIndex++;
        const currentCall = callIndex;

        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        const maybeSingleFn = jest.fn();
        const eqFn = jest.fn(() => chain);
        chain.select = jest.fn(() => chain);
        chain.eq = eqFn;
        chain.single = singleFn;
        chain.maybeSingle = maybeSingleFn;
        chain.order = jest.fn(() => chain);

        eqCallsPerFrom.push([] as jest.Mock[]);

        let promiseResolve: ((v: unknown) => void) | undefined;
        const promise = new Promise((resolve) => { promiseResolve = resolve; });
        Object.defineProperty(chain, 'then', {
          get: () => promise.then.bind(promise),
          configurable: true,
        });

        if (table === 'person' && currentCall === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'tree' && currentCall === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'person' && currentCall === 3) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && currentCall === 4) {
          maybeSingleFn.mockResolvedValue({ data: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && currentCall === 5) {
          promiseResolve!({ data: [] });
        } else if (table === 'relation' && currentCall === 6) {
          const insertSelectChain: Record<string, unknown> = {};
          insertSelectChain.single = jest.fn().mockResolvedValue({
            data: { id: 'new-relation-id' },
            error: null,
          });
          chain.insert = jest.fn(() => ({ select: jest.fn(() => insertSelectChain) }));
          promiseResolve!(undefined);
        } else {
          promiseResolve!(undefined);
        }

        return chain;
      });

      await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'biological',
      });

      // 2回目の from() 呼び出し (tree テーブル) の eq が owner_user_id を正しく渡していること
      // mockFrom の2回目の呼び出しで返した chain.eq に対してアサート
      const allFromCalls = mockFrom.mock.calls;
      // from('tree') は callIndex===2 の呼び出し
      expect(allFromCalls[1][0]).toBe('tree');

      // from('tree') の呼び出し時に返した chain の eq を検証するため、
      // mockFrom の2回目の戻り値の eq が ('owner_user_id', USER_ID) で呼ばれたことを確認する
      const treeChain = mockFrom.mock.results[1].value as Record<string, jest.Mock>;
      expect(treeChain.eq).toHaveBeenCalledWith('owner_user_id', USER_ID);
    });
  });

  // -------------------------------------------------------------------------
  // クロスツリー: 自分の別ツリーの人物を childId に指定 → NOT_FOUND
  // -------------------------------------------------------------------------
  describe('クロスツリー: 自分の別ツリーの人物を childId に指定', () => {
    it('childId が別ツリーに属する場合 NOT_FOUND を返すこと', async () => {
      setupAuthenticatedSession();

      const OTHER_TREE_ID = 'bbbbbbbb-0000-0000-0000-000000000099';

      let callIndex = 0;
      mockFrom.mockImplementation((table: string) => {
        callIndex++;
        const currentCall = callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = jest.fn();
        chain.insert = jest.fn(() => chain);
        chain.order = jest.fn(() => chain);

        if (table === 'person' && currentCall === 1) {
          // 親人物は TREE_ID に属する
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (table === 'tree' && currentCall === 2) {
          // ツリー所有権確認: 成功
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (table === 'person' && currentCall === 3) {
          // 子人物は TREE_ID と異なる別ツリーに属するため、
          // .eq('tree_id', TREE_ID) の条件に合致せず NOT_FOUND
          singleFn.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
        }

        return chain;
      });

      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // バリデーションエラー: note 1000文字超過
  // -------------------------------------------------------------------------
  describe('バリデーションエラー: note 1000文字超過', () => {
    it('note が1001文字の場合 VALIDATION_ERROR を返すこと', async () => {
      setupAuthenticatedSession();

      const longNote = 'あ'.repeat(1001);
      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'biological',
        note: longNote,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('note がちょうど1000文字の場合は成功すること', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation((table: string) => {
        callIndex++;
        const currentCall = callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        const maybeSingleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = maybeSingleFn;
        chain.order = jest.fn(() => chain);

        let promiseResolve: ((v: unknown) => void) | undefined;
        const promise = new Promise((resolve) => { promiseResolve = resolve; });
        Object.defineProperty(chain, 'then', {
          get: () => promise.then.bind(promise),
          configurable: true,
        });

        if (table === 'person' && currentCall === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'tree' && currentCall === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'person' && currentCall === 3) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && currentCall === 4) {
          maybeSingleFn.mockResolvedValue({ data: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && currentCall === 5) {
          promiseResolve!({ data: [] });
        } else if (table === 'relation' && currentCall === 6) {
          const insertSelectChain: Record<string, unknown> = {};
          insertSelectChain.single = jest.fn().mockResolvedValue({
            data: { id: 'new-relation-id' },
            error: null,
          });
          chain.insert = jest.fn(() => ({ select: jest.fn(() => insertSelectChain) }));
          promiseResolve!(undefined);
        } else {
          promiseResolve!(undefined);
        }

        return chain;
      });

      const exactNote = 'a'.repeat(1000);
      const result = await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'biological',
        note: exactNote,
      });

      expect(result).toEqual({
        ok: true,
        data: { relationId: 'new-relation-id' },
      });
    });
  });

  // -------------------------------------------------------------------------
  // 正常系: INSERT 引数の parent_role 検証
  // -------------------------------------------------------------------------
  describe('正常系: INSERT に渡される parent_role の検証', () => {
    it('parentRole が adoptive のとき INSERT に parent_role: "adoptive" が渡されること', async () => {
      setupAuthenticatedSession();

      let capturedInsertArgs: unknown = null;
      let callIndex = 0;
      mockFrom.mockImplementation((table: string) => {
        callIndex++;
        const currentCall = callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        const maybeSingleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = maybeSingleFn;
        chain.order = jest.fn(() => chain);

        let promiseResolve: ((v: unknown) => void) | undefined;
        const promise = new Promise((resolve) => { promiseResolve = resolve; });
        Object.defineProperty(chain, 'then', {
          get: () => promise.then.bind(promise),
          configurable: true,
        });

        if (table === 'person' && currentCall === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'tree' && currentCall === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'person' && currentCall === 3) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && currentCall === 4) {
          maybeSingleFn.mockResolvedValue({ data: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && currentCall === 5) {
          promiseResolve!({ data: [] });
        } else if (table === 'relation' && currentCall === 6) {
          const insertSelectChain: Record<string, unknown> = {};
          insertSelectChain.single = jest.fn().mockResolvedValue({
            data: { id: 'new-relation-id' },
            error: null,
          });
          const insertFn = jest.fn((args: unknown) => {
            capturedInsertArgs = args;
            return { select: jest.fn(() => insertSelectChain) };
          });
          chain.insert = insertFn;
          promiseResolve!(undefined);
        } else {
          promiseResolve!(undefined);
        }

        return chain;
      });

      await createParentChild({
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parentRole: 'adoptive',
      });

      expect(capturedInsertArgs).toEqual(
        expect.objectContaining({ parent_role: 'adoptive' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // BFS ダイヤモンド構造: 無限ループしないこと & 循環検出
  // -------------------------------------------------------------------------
  describe('BFS ダイヤモンド構造', () => {
    it('A→B, A→C, B→D, C→D の構造で D→A は RELATION_CONFLICT になること', async () => {
      setupAuthenticatedSession();

      const A_ID = 'dddddddd-0000-0000-0000-000000000001';
      const B_ID = 'dddddddd-0000-0000-0000-000000000002';
      const C_ID = 'dddddddd-0000-0000-0000-000000000003';
      const D_ID = 'dddddddd-0000-0000-0000-000000000004';

      // D→A を作ろうとする: parentId=D, childId=A
      // BFS は childId=A の子孫を探索する: A→B, A→C → B→D, C→D → D は parentId なので循環検出

      let callIndex = 0;
      mockFrom.mockImplementation((table: string) => {
        callIndex++;
        const currentCall = callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        const maybeSingleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = maybeSingleFn;
        chain.order = jest.fn(() => chain);

        let promiseResolve: ((v: unknown) => void) | undefined;
        const promise = new Promise((resolve) => { promiseResolve = resolve; });
        Object.defineProperty(chain, 'then', {
          get: () => promise.then.bind(promise),
          configurable: true,
        });

        if (table === 'person' && currentCall === 1) {
          // 親(D)のツリーID取得
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'tree' && currentCall === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'person' && currentCall === 3) {
          // 子(A)の同一ツリー確認
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && currentCall === 4) {
          // 重複チェック: なし
          maybeSingleFn.mockResolvedValue({ data: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && currentCall === 5) {
          // BFS 1回目: A の子 → B, C
          promiseResolve!({ data: [{ to_person_id: B_ID }, { to_person_id: C_ID }] });
        } else if (table === 'relation' && currentCall === 6) {
          // BFS 2回目: B の子 → D (= parentId=D → 循環検出)
          promiseResolve!({ data: [{ to_person_id: D_ID }] });
        } else if (table === 'relation' && currentCall >= 7) {
          // BFS 追加 (C の子など) → D はすでに visited または循環検出済み
          promiseResolve!({ data: [{ to_person_id: D_ID }] });
        } else {
          promiseResolve!({ data: [] });
        }

        return chain;
      });

      const result = await createParentChild({
        parentId: D_ID,
        childId: A_ID,
        parentRole: 'biological',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'RELATION_CONFLICT' }),
      });
    });

    it('ダイヤモンド構造でも visited セットにより同一ノードを重複訪問しないこと', async () => {
      setupAuthenticatedSession();

      const A_ID = 'eeeeeeee-0000-0000-0000-000000000001';
      const B_ID = 'eeeeeeee-0000-0000-0000-000000000002';
      const C_ID = 'eeeeeeee-0000-0000-0000-000000000003';
      const D_ID = 'eeeeeeee-0000-0000-0000-000000000004';
      const E_ID = 'eeeeeeee-0000-0000-0000-000000000005';

      // A→B, A→C, B→D, C→D の構造で E→A を作成しようとする
      // E は D の子でも祖先でもないので循環なし → 成功するはず
      // BFS で D が B と C の両方から到達されるが、visited により重複訪問しない

      let callIndex = 0;
      const bfsQueryCount = { count: 0 };
      mockFrom.mockImplementation((table: string) => {
        callIndex++;
        const currentCall = callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        const maybeSingleFn = jest.fn();
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.single = singleFn;
        chain.maybeSingle = maybeSingleFn;
        chain.order = jest.fn(() => chain);

        let promiseResolve: ((v: unknown) => void) | undefined;
        const promise = new Promise((resolve) => { promiseResolve = resolve; });
        Object.defineProperty(chain, 'then', {
          get: () => promise.then.bind(promise),
          configurable: true,
        });

        if (table === 'person' && currentCall === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'tree' && currentCall === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'person' && currentCall === 3) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && currentCall === 4) {
          maybeSingleFn.mockResolvedValue({ data: null });
          promiseResolve!(undefined);
        } else if (table === 'relation' && currentCall >= 5) {
          // BFS クエリ (5回目以降)
          bfsQueryCount.count++;
          const bfsCall = bfsQueryCount.count;
          if (bfsCall === 1) {
            // A の子: B, C
            promiseResolve!({ data: [{ to_person_id: B_ID }, { to_person_id: C_ID }] });
          } else if (bfsCall === 2) {
            // B の子: D
            promiseResolve!({ data: [{ to_person_id: D_ID }] });
          } else if (bfsCall === 3) {
            // C の子: D (D はすでに visited → queue に再追加されない)
            promiseResolve!({ data: [{ to_person_id: D_ID }] });
          } else if (bfsCall === 4) {
            // D の子: なし
            promiseResolve!({ data: [] });
          } else {
            // それ以上の BFS クエリは来ないはず (visited セットが正しく機能していれば)
            promiseResolve!({ data: [] });
          }
        } else {
          promiseResolve!(undefined);
        }

        if (table === 'relation' && currentCall === 9) {
          // INSERT チェーン (BFS 完了後)
          const insertSelectChain: Record<string, unknown> = {};
          insertSelectChain.single = jest.fn().mockResolvedValue({
            data: { id: 'new-relation-id' },
            error: null,
          });
          chain.insert = jest.fn(() => ({ select: jest.fn(() => insertSelectChain) }));
        }

        return chain;
      });

      // E を parentId、A を childId として E→A を作成する
      // A→B, A→C, B→D, C→D が既存で E はどこにも繋がっていないので循環なし
      await createParentChild({
        parentId: E_ID,
        childId: A_ID,
        parentRole: 'biological',
      });

      // BFS が D を 2 回訪問しないことを検証する (visited セットの動作確認)
      // ダイヤモンド構造: A→B, A→C, B→D, C→D で D は B と C の両経路から到達される
      // visited セットが正しく機能していれば BFS クエリは 4 回のみ (A, B, C, D 各1回)
      // 加えて INSERT 用に from('relation') が 1 回呼ばれるため合計 5 回以内となる
      // (bfsQueryCount は currentCall >= 5 の relation クエリをすべてカウントするため
      //  INSERT 呼び出しも含まれる可能性がある)
      expect(bfsQueryCount.count).toBeLessThanOrEqual(5);
    });
  });
});
