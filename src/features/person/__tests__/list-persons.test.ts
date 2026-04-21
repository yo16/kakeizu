/**
 * listPersons Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・一覧取得・フィールドマッピングを検証する。
 * listPersons はツリーの所有権確認を先に行い、その後 person テーブルを全フィールドで取得する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// getServerSession をモック
jest.mock('@/lib/auth/session', () => ({
  getServerSession: jest.fn(),
}));

// Supabase クライアントをモック
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { listPersons } from '../actions/list-persons';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// テスト用 UUID
const USER_ID   = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID   = 'bbbbbbbb-0000-0000-0000-000000000001';
const PERSON_ID1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const PERSON_ID2 = 'aaaaaaaa-0000-0000-0000-000000000002';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/** DB から返される person レコードの完全形 */
function makeDbPerson(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: PERSON_ID1,
    tree_id: TREE_ID,
    display_name: '山田太郎',
    family_name: '山田',
    given_name: '太郎',
    maiden_name: null,
    gender: 'male',
    birth_year: 1990,
    birth_month: 5,
    birth_day: 10,
    birth_place: '東京都',
    death_year: null,
    death_month: null,
    death_day: null,
    death_place: null,
    is_alive: true,
    note: null,
    primary_photo_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    ...overrides,
  };
}

/**
 * from() モックを設定するヘルパー。
 * 1回目: tree テーブル所有権確認 (select→eq→eq→single)
 * 2回目: person テーブル一覧取得 (select→eq→order) — order が Promise として解決
 */
function buildFromMock(options: {
  ownershipResult: { data: unknown; error: unknown };
  personsResult?: { data: unknown; error: unknown };
}) {
  const {
    ownershipResult,
    personsResult = { data: [], error: null },
  } = options;

  let callIndex = 0;
  const mockFrom = jest.fn().mockImplementation(() => {
    callIndex++;
    const currentCall = callIndex;
    const chain: Record<string, unknown> = {};
    const singleFn = jest.fn();
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.single = singleFn;
    chain.order = jest.fn().mockReturnValue(chain);

    if (currentCall === 1) {
      // tree 所有権確認
      singleFn.mockResolvedValue(ownershipResult);
    } else if (currentCall === 2) {
      // person 一覧取得: order が最後のチェーンで Promise として解決
      const personsChain: Record<string, unknown> = {};
      personsChain.select = jest.fn().mockReturnValue(personsChain);
      personsChain.eq = jest.fn().mockReturnValue(personsChain);
      personsChain.order = jest.fn().mockResolvedValue(personsResult);
      return personsChain;
    }

    return chain;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return { mockFrom };
}

/** 有効な listPersons 入力データ */
const validInput = { treeId: TREE_ID };

describe('listPersons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 未ログイン → UNAUTHENTICATED
  // ---------------------------------------------------------------------------
  describe('未ログイン', () => {
    it('セッションが null の場合 UNAUTHENTICATED を返すこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const result = await listPersons(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await listPersons(validInput);

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // バリデーションエラー → VALIDATION_ERROR
  // ---------------------------------------------------------------------------
  describe('バリデーションエラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('treeId が UUID 形式でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await listPersons({ treeId: 'not-a-uuid' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('treeId が未指定の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await listPersons({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await listPersons({ treeId: 'not-a-uuid' });

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 所有権なし → FORBIDDEN
  // ---------------------------------------------------------------------------
  describe('所有権なし', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('ツリーが存在しない場合 FORBIDDEN を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: null, error: { code: 'PGRST116' } },
      });

      const result = await listPersons(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });

    it('他人のツリーの場合 FORBIDDEN を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: null, error: null },
      });

      const result = await listPersons(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // DB エラー → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('DB エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('person テーブルのクエリでエラーが発生した場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        personsResult: { data: null, error: { message: 'DB error' } },
      });

      const result = await listPersons(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 空配列
  // ---------------------------------------------------------------------------
  describe('空配列', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('人物が存在しない場合 空配列を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        personsResult: { data: [], error: null },
      });

      const result = await listPersons(validInput);

      expect(result).toEqual({ ok: true, data: [] });
    });

    it('persons が null の場合 空配列を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        personsResult: { data: null, error: null },
      });

      const result = await listPersons(validInput);

      expect(result).toEqual({ ok: true, data: [] });
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系
  // ---------------------------------------------------------------------------
  describe('正常系', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('人物一覧を全フィールドで返すこと', async () => {
      const dbPerson = makeDbPerson();
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        personsResult: { data: [dbPerson], error: null },
      });

      const result = await listPersons(validInput);

      expect(result).toEqual({
        ok: true,
        data: [
          {
            id: PERSON_ID1,
            treeId: TREE_ID,
            displayName: '山田太郎',
            familyName: '山田',
            givenName: '太郎',
            maidenName: null,
            gender: 'male',
            birthYear: 1990,
            birthMonth: 5,
            birthDay: 10,
            birthPlace: '東京都',
            deathYear: null,
            deathMonth: null,
            deathDay: null,
            deathPlace: null,
            isAlive: true,
            note: null,
            primaryPhotoId: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
          },
        ],
      });
    });

    it('複数人物が存在する場合に全員を返すこと', async () => {
      const dbPersons = [
        makeDbPerson({ id: PERSON_ID1, display_name: '山田太郎' }),
        makeDbPerson({ id: PERSON_ID2, display_name: '山田花子', gender: 'female' }),
      ];
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        personsResult: { data: dbPersons, error: null },
      });

      const result = await listPersons(validInput);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe(PERSON_ID1);
      expect(result.data[1].id).toBe(PERSON_ID2);
    });

    it('スネークケースのDBフィールドがキャメルケースにマッピングされること', async () => {
      const dbPerson = makeDbPerson();
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        personsResult: { data: [dbPerson], error: null },
      });

      const result = await listPersons(validInput);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const person = result.data[0];
      // キャメルケースキーが存在すること
      expect(person).toHaveProperty('treeId');
      expect(person).toHaveProperty('displayName');
      expect(person).toHaveProperty('birthYear');
      expect(person).toHaveProperty('isAlive');
      expect(person).toHaveProperty('primaryPhotoId');

      // スネークケースキーが存在しないこと
      expect(person).not.toHaveProperty('tree_id');
      expect(person).not.toHaveProperty('display_name');
      expect(person).not.toHaveProperty('birth_year');
      expect(person).not.toHaveProperty('is_alive');
    });

    it('nullable フィールドが null の場合 null で返すこと', async () => {
      const dbPerson = makeDbPerson({
        family_name: null,
        given_name: null,
        birth_year: null,
        gender: null,
        note: null,
        primary_photo_id: null,
      });
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        personsResult: { data: [dbPerson], error: null },
      });

      const result = await listPersons(validInput);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const person = result.data[0];
      expect(person.familyName).toBeNull();
      expect(person.givenName).toBeNull();
      expect(person.birthYear).toBeNull();
      expect(person.gender).toBeNull();
      expect(person.note).toBeNull();
      expect(person.primaryPhotoId).toBeNull();
    });
  });
});
