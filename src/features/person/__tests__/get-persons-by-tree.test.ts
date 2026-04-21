/**
 * getPersonsByTree Server Action のユニットテスト
 *
 * @/lib/auth/session の getServerSession と
 * @/lib/supabase/server の createClient をモックして、
 * 認証・所有権確認・人物一覧取得を検証する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// getServerSession をモック
jest.mock('@/lib/auth/session', () => ({
  getServerSession: jest.fn(),
}));

// Supabase クライアントのクエリビルダチェーンをモック
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { getPersonsByTree, type PersonSummary } from '../actions/get-persons-by-tree';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

// ホイスト問題を回避: import 後にキャストして取得
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// 各テーブルごとにモックを保持できるよう、from の戻り値を制御する
const mockFrom = jest.fn();

// テスト用 UUID
const TREE_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const USER_ID = 'cccccccc-0000-0000-0000-000000000001';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  });
}

/** Supabase クエリビルダチェーンを構築するヘルパー */
function buildQueryChain() {
  const singleFn = jest.fn();
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.single = singleFn;
  chain.order = jest.fn(() => chain);
  return { chain, singleFn };
}

/** DB の person レコード形式 */
function makeDbPerson(overrides?: Partial<{
  id: string;
  display_name: string;
  birth_year: number | null;
  gender: string | null;
}>) {
  return {
    id: 'person-001',
    display_name: '山田太郎',
    birth_year: 1970,
    gender: 'male',
    ...overrides,
  };
}

describe('getPersonsByTree', () => {
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

      const result = await getPersonsByTree(TREE_ID);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await getPersonsByTree(TREE_ID);

      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // ツリー所有権確認 (FORBIDDEN)
  // -------------------------------------------------------------------------
  describe('他人のツリーへのアクセス', () => {
    it('他人のツリーIDを指定した場合 FORBIDDEN を返すこと', async () => {
      setupAuthenticatedSession();

      const { chain, singleFn } = buildQueryChain();
      singleFn.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      mockFrom.mockReturnValue(chain);

      const result = await getPersonsByTree(TREE_ID);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });

    it('ツリー所有権確認でエラーが発生した場合 FORBIDDEN を返すこと', async () => {
      setupAuthenticatedSession();

      const { chain, singleFn } = buildQueryChain();
      singleFn.mockResolvedValue({ data: null, error: { message: 'DB error' } });
      mockFrom.mockReturnValue(chain);

      const result = await getPersonsByTree(TREE_ID);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // DB エラー (INTERNAL_ERROR)
  // -------------------------------------------------------------------------
  describe('DB エラー', () => {
    it('person テーブルのクエリでエラーが発生した場合 INTERNAL_ERROR を返すこと', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation(() => {
        callIndex++;
        const { chain, singleFn } = buildQueryChain();

        if (callIndex === 1) {
          // ツリー所有権確認: 成功
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (callIndex === 2) {
          // person テーブルクエリ: エラー
          // getPersonsByTree は .select().eq().order() のチェーンを await するため
          // チェーンの最後を Promise として解決させる
          const errorChain: Record<string, unknown> = {};
          errorChain.select = jest.fn(() => errorChain);
          errorChain.eq = jest.fn(() => errorChain);
          const orderFn = jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'relation does not exist' },
          });
          errorChain.order = orderFn;
          return errorChain;
        }

        return chain;
      });

      const result = await getPersonsByTree(TREE_ID);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 空のツリー
  // -------------------------------------------------------------------------
  describe('空のツリー', () => {
    it('人物が存在しないツリーの場合 空配列を返すこと', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation(() => {
        callIndex++;
        const { chain, singleFn } = buildQueryChain();

        if (callIndex === 1) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (callIndex === 2) {
          const emptyChain: Record<string, unknown> = {};
          emptyChain.select = jest.fn(() => emptyChain);
          emptyChain.eq = jest.fn(() => emptyChain);
          emptyChain.order = jest.fn().mockResolvedValue({ data: [], error: null });
          return emptyChain;
        }

        return chain;
      });

      const result = await getPersonsByTree(TREE_ID);

      expect(result).toEqual({
        ok: true,
        data: [],
      });
    });

    it('persons が null の場合 空配列を返すこと', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation(() => {
        callIndex++;
        const { chain, singleFn } = buildQueryChain();

        if (callIndex === 1) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (callIndex === 2) {
          const nullChain: Record<string, unknown> = {};
          nullChain.select = jest.fn(() => nullChain);
          nullChain.eq = jest.fn(() => nullChain);
          nullChain.order = jest.fn().mockResolvedValue({ data: null, error: null });
          return nullChain;
        }

        return chain;
      });

      const result = await getPersonsByTree(TREE_ID);

      expect(result).toEqual({
        ok: true,
        data: [],
      });
    });
  });

  // -------------------------------------------------------------------------
  // 正常系
  // -------------------------------------------------------------------------
  describe('正常系', () => {
    function setupSuccessfulPersonsQuery(persons: ReturnType<typeof makeDbPerson>[]) {
      let callIndex = 0;
      mockFrom.mockImplementation(() => {
        callIndex++;
        const { chain, singleFn } = buildQueryChain();

        if (callIndex === 1) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (callIndex === 2) {
          const personsChain: Record<string, unknown> = {};
          personsChain.select = jest.fn(() => personsChain);
          personsChain.eq = jest.fn(() => personsChain);
          personsChain.order = jest.fn().mockResolvedValue({ data: persons, error: null });
          return personsChain;
        }

        return chain;
      });
    }

    it('認証済み・自分のツリーで人物一覧を返すこと', async () => {
      setupAuthenticatedSession();
      const dbPersons = [
        makeDbPerson({ id: 'person-001', display_name: '山田太郎', birth_year: 1970, gender: 'male' }),
        makeDbPerson({ id: 'person-002', display_name: '山田花子', birth_year: 1975, gender: 'female' }),
      ];
      setupSuccessfulPersonsQuery(dbPersons);

      const result = await getPersonsByTree(TREE_ID);

      expect(result).toEqual({
        ok: true,
        data: [
          { id: 'person-001', displayName: '山田太郎', birthYear: 1970, gender: 'male' },
          { id: 'person-002', displayName: '山田花子', birthYear: 1975, gender: 'female' },
        ],
      });
    });

    it('PersonSummary の形式 (id, displayName, birthYear, gender) が正しいこと', async () => {
      setupAuthenticatedSession();
      const dbPersons = [
        makeDbPerson({ id: 'person-999', display_name: 'テスト太郎', birth_year: 2000, gender: 'male' }),
      ];
      setupSuccessfulPersonsQuery(dbPersons);

      const result = await getPersonsByTree(TREE_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const person: PersonSummary = result.data[0];
      expect(person).toHaveProperty('id', 'person-999');
      expect(person).toHaveProperty('displayName', 'テスト太郎');
      expect(person).toHaveProperty('birthYear', 2000);
      expect(person).toHaveProperty('gender', 'male');
      // DB の display_name が displayName にマッピングされていること
      expect(person).not.toHaveProperty('display_name');
      // DB の birth_year が birthYear にマッピングされていること
      expect(person).not.toHaveProperty('birth_year');
    });

    it('birth_year が null の場合 birthYear が null になること', async () => {
      setupAuthenticatedSession();
      const dbPersons = [makeDbPerson({ birth_year: null })];
      setupSuccessfulPersonsQuery(dbPersons);

      const result = await getPersonsByTree(TREE_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data[0].birthYear).toBeNull();
    });

    it('gender が null の場合 gender が null になること', async () => {
      setupAuthenticatedSession();
      const dbPersons = [makeDbPerson({ gender: null })];
      setupSuccessfulPersonsQuery(dbPersons);

      const result = await getPersonsByTree(TREE_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data[0].gender).toBeNull();
    });

    it('複数人物が存在する場合に全員を返すこと', async () => {
      setupAuthenticatedSession();
      const dbPersons = [
        makeDbPerson({ id: 'person-001', display_name: 'A' }),
        makeDbPerson({ id: 'person-002', display_name: 'B' }),
        makeDbPerson({ id: 'person-003', display_name: 'C' }),
      ];
      setupSuccessfulPersonsQuery(dbPersons);

      const result = await getPersonsByTree(TREE_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // 非正常な treeId の挙動
  // -------------------------------------------------------------------------
  describe('非正常な treeId の挙動', () => {
    it('treeId が空文字の場合 FORBIDDEN を返すこと', async () => {
      // 実装は treeId をバリデーションせず直接 Supabase クエリに渡す。
      // .eq('id', '').eq('owner_user_id', ...) に合致するレコードは存在しないため
      // single() は PGRST116 エラーを返し、FORBIDDEN になる。
      setupAuthenticatedSession();

      const { chain, singleFn } = buildQueryChain();
      singleFn.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      mockFrom.mockReturnValue(chain);

      const result = await getPersonsByTree('');

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });

    it('treeId が UUID 形式でない場合 FORBIDDEN を返すこと', async () => {
      // 実装は treeId をバリデーションせず直接 Supabase クエリに渡す。
      // UUID 形式でない文字列を .eq('id', 'not-a-uuid') に渡した場合、
      // Supabase (PostgREST) は型不一致または 0 件を返すため FORBIDDEN になる。
      setupAuthenticatedSession();

      const { chain, singleFn } = buildQueryChain();
      singleFn.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      mockFrom.mockReturnValue(chain);

      const result = await getPersonsByTree('not-a-uuid');

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });
  });
});
