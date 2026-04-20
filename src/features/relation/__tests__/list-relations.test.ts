/**
 * listRelations Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・SELECT・データマッピングを検証する。
 */

// server-only モジュールをモック (listRelations 自体は server-only を使わないが
// 依存モジュールを一貫してモックする)
jest.mock('server-only', () => ({}));

// getServerSession をモック
jest.mock('@/lib/auth/session', () => ({
  getServerSession: jest.fn(),
}));

// Supabase クライアントをモック
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { listRelations } from '../actions/list-relations';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// テスト用 UUID
const TREE_ID  = 'bbbbbbbb-0000-0000-0000-000000000001';
const USER_ID  = 'cccccccc-0000-0000-0000-000000000001';
const REL_ID_1 = 'eeeeeeee-0000-0000-0000-000000000001';
const REL_ID_2 = 'eeeeeeee-0000-0000-0000-000000000002';
const P_ID_1   = 'aaaaaaaa-0000-0000-0000-000000000001';
const P_ID_2   = 'aaaaaaaa-0000-0000-0000-000000000002';
const P_ID_3   = 'aaaaaaaa-0000-0000-0000-000000000003';

/** 認証済みセッションをセットアップ */
function setupSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({ user: { id: userId }, session: null });
}

/**
 * SELECT クエリ (order まで含む) の末端を Promise として解決する
 * チェーンオブジェクトを返すユーティリティ。
 */
function buildSelectChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.order = jest.fn(() => {
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
  });
  return chain;
}

/**
 * ハッピーパスの Supabase モックを構築する。
 *
 * - from('tree').select().eq().eq().single() → tree 所有権確認
 * - from('relation').select(...).eq().order() → relations SELECT
 */
function buildHappyPathMock(options?: {
  treeFound?: boolean;
  relationsData?: unknown[];
  selectError?: object | null;
}) {
  const {
    treeFound = true,
    relationsData = [],
    selectError = null,
  } = options ?? {};

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
      // tree 所有権確認
      if (treeFound) {
        singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
      } else {
        singleFn.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      }
    } else if (currentIndex === 2) {
      // relations SELECT (order で終端)
      return buildSelectChain({ data: selectError ? null : relationsData, error: selectError });
    }

    return chain;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return mockFrom;
}

describe('listRelations', () => {
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

      const result = await listRelations({ treeId: TREE_ID });

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

    it('treeId が UUID でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await listRelations({ treeId: 'not-a-uuid' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('treeId が省略された場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await listRelations({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が null の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await listRelations(null);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 所有権なし → FORBIDDEN
  // -------------------------------------------------------------------------
  describe('所有権なし', () => {
    it('他人のツリーの場合 FORBIDDEN を返すこと', async () => {
      setupSession();
      buildHappyPathMock({ treeFound: false });

      const result = await listRelations({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 正常系: 全 relation 取得
  // -------------------------------------------------------------------------
  describe('正常系: relations 取得', () => {
    it('ツリー内の全 relation を取得して返すこと', async () => {
      setupSession();

      const rawRows = [
        {
          id: REL_ID_1,
          tree_id: TREE_ID,
          kind: 'parent_child',
          from_person_id: P_ID_1,
          to_person_id: P_ID_2,
          parent_role: 'biological',
          marriage_type: null,
          marriage_status: null,
          start_year: null,
          start_month: null,
          end_year: null,
          end_month: null,
          note: null,
          created_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: REL_ID_2,
          tree_id: TREE_ID,
          kind: 'marriage',
          from_person_id: P_ID_1,
          to_person_id: P_ID_3,
          parent_role: null,
          marriage_type: 'spouse',
          marriage_status: 'current',
          start_year: 2000,
          start_month: 6,
          end_year: null,
          end_month: null,
          note: '結婚式は東京',
          created_at: '2024-01-02T00:00:00.000Z',
        },
      ];

      buildHappyPathMock({ relationsData: rawRows });

      const result = await listRelations({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: true,
        data: {
          relations: [
            {
              id: REL_ID_1,
              treeId: TREE_ID,
              kind: 'parent_child',
              fromPersonId: P_ID_1,
              toPersonId: P_ID_2,
              parentRole: 'biological',
              marriageType: null,
              marriageStatus: null,
              startYear: null,
              startMonth: null,
              endYear: null,
              endMonth: null,
              note: null,
              createdAt: '2024-01-01T00:00:00.000Z',
            },
            {
              id: REL_ID_2,
              treeId: TREE_ID,
              kind: 'marriage',
              fromPersonId: P_ID_1,
              toPersonId: P_ID_3,
              parentRole: null,
              marriageType: 'spouse',
              marriageStatus: 'current',
              startYear: 2000,
              startMonth: 6,
              endYear: null,
              endMonth: null,
              note: '結婚式は東京',
              createdAt: '2024-01-02T00:00:00.000Z',
            },
          ],
        },
      });
    });
  });

  // -------------------------------------------------------------------------
  // 正常系: 空配列
  // -------------------------------------------------------------------------
  describe('正常系: relations が空', () => {
    it('ツリー内に relation が存在しない場合 空配列を返すこと', async () => {
      setupSession();
      buildHappyPathMock({ relationsData: [] });

      const result = await listRelations({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: true,
        data: { relations: [] },
      });
    });
  });

  // -------------------------------------------------------------------------
  // DB エラー → INTERNAL_ERROR
  // -------------------------------------------------------------------------
  describe('DB エラー', () => {
    it('SELECT でエラーが発生した場合 INTERNAL_ERROR を返すこと', async () => {
      setupSession();
      buildHappyPathMock({
        selectError: { code: '42000', message: 'db error' },
      });

      const result = await listRelations({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });
});
