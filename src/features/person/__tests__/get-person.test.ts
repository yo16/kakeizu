/**
 * getPerson Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・人物取得・フィールドマッピングを検証する。
 * getPerson は JOIN クエリで人物取得と所有権確認を1回のクエリで行う。
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

import { getPerson } from '../actions/get-person';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// テスト用 UUID
const USER_ID   = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID   = 'bbbbbbbb-0000-0000-0000-000000000001';
const PERSON_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PHOTO_ID  = 'dddddddd-0000-0000-0000-000000000001';

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
    id: PERSON_ID,
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
    note: 'テストメモ',
    primary_photo_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    tree: { owner_user_id: USER_ID },
    ...overrides,
  };
}

/**
 * from() モックを設定するヘルパー。
 * person テーブルの JOIN クエリ (select→eq→eq→single) を1回のみ実行する。
 */
function buildFromMock(fetchResult: { data: unknown; error: unknown }) {
  const singleFn = jest.fn().mockResolvedValue(fetchResult);
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.single = singleFn;

  const mockFrom = jest.fn().mockReturnValue(chain);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return { mockFrom, singleFn };
}

/** 有効な getPerson 入力データ */
const validInput = { personId: PERSON_ID };

describe('getPerson', () => {
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

      const result = await getPerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await getPerson(validInput);

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

    it('personId が UUID 形式でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await getPerson({ personId: 'not-a-uuid' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('personId が未指定の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await getPerson({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await getPerson({ personId: 'not-a-uuid' });

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 所有権なし / 存在しない → NOT_FOUND
  // ---------------------------------------------------------------------------
  describe('所有権なし / 存在しない', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('人物が存在しない場合 NOT_FOUND を返すこと', async () => {
      buildFromMock({ data: null, error: { code: 'PGRST116' } });

      const result = await getPerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });

    it('他人のツリーの人物の場合 NOT_FOUND を返すこと', async () => {
      buildFromMock({ data: null, error: null });

      const result = await getPerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系
  // ---------------------------------------------------------------------------
  describe('正常系', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('人物の全フィールドを返すこと', async () => {
      const dbPerson = makeDbPerson();
      buildFromMock({ data: dbPerson, error: null });

      const result = await getPerson(validInput);

      expect(result).toEqual({
        ok: true,
        data: {
          id: PERSON_ID,
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
          note: 'テストメモ',
          primaryPhotoId: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      });
    });

    it('スネークケースのDBフィールドがキャメルケースにマッピングされること', async () => {
      const dbPerson = makeDbPerson();
      buildFromMock({ data: dbPerson, error: null });

      const result = await getPerson(validInput);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // キャメルケースキーが存在すること
      expect(result.data).toHaveProperty('treeId');
      expect(result.data).toHaveProperty('displayName');
      expect(result.data).toHaveProperty('familyName');
      expect(result.data).toHaveProperty('givenName');
      expect(result.data).toHaveProperty('birthYear');
      expect(result.data).toHaveProperty('isAlive');
      expect(result.data).toHaveProperty('primaryPhotoId');
      expect(result.data).toHaveProperty('createdAt');
      expect(result.data).toHaveProperty('updatedAt');

      // スネークケースキーが存在しないこと
      expect(result.data).not.toHaveProperty('tree_id');
      expect(result.data).not.toHaveProperty('display_name');
      expect(result.data).not.toHaveProperty('birth_year');
      expect(result.data).not.toHaveProperty('is_alive');
    });

    it('primaryPhotoId が設定されている場合に返すこと', async () => {
      const dbPerson = makeDbPerson({ primary_photo_id: PHOTO_ID });
      buildFromMock({ data: dbPerson, error: null });

      const result = await getPerson(validInput);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.primaryPhotoId).toBe(PHOTO_ID);
    });

    it('nullable フィールドが null の場合 null で返すこと', async () => {
      const dbPerson = makeDbPerson({
        family_name: null,
        given_name: null,
        maiden_name: null,
        gender: null,
        birth_year: null,
        birth_month: null,
        birth_day: null,
        birth_place: null,
        death_year: null,
        death_month: null,
        death_day: null,
        death_place: null,
        note: null,
        primary_photo_id: null,
      });
      buildFromMock({ data: dbPerson, error: null });

      const result = await getPerson(validInput);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.familyName).toBeNull();
      expect(result.data.givenName).toBeNull();
      expect(result.data.maidenName).toBeNull();
      expect(result.data.gender).toBeNull();
      expect(result.data.birthYear).toBeNull();
      expect(result.data.primaryPhotoId).toBeNull();
    });
  });
});
