/**
 * getPhotos Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・SELECT・スネーク→キャメルケースマッピング を検証する。
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

import { getPhotos } from '../actions/get-photos';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// テスト用 UUID
const USER_ID  = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID  = 'bbbbbbbb-0000-0000-0000-000000000001';
const PHOTO_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PERSON_ID = 'dddddddd-0000-0000-0000-000000000001';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * from() モックを設定するヘルパー。
 * 1回目: ツリー所有権確認 (select→eq→eq→single)
 * 2回目: photo 一覧取得 (select→eq→order)
 */
function buildFromMock(options: {
  ownershipResult: { data: unknown; error: unknown };
  photosResult?: { data: unknown; error: unknown };
}) {
  const {
    ownershipResult,
    photosResult = { data: [], error: null },
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
    chain.order = jest.fn().mockResolvedValue(photosResult);

    if (currentCall === 1) {
      // 所有権確認クエリ
      singleFn.mockResolvedValue(ownershipResult);
    }

    return chain;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return { mockFrom };
}

/** 有効な getPhotos 入力データ */
const validInput = { treeId: TREE_ID };

describe('getPhotos', () => {
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

      const result = await getPhotos(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await getPhotos(validInput);

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
      const result = await getPhotos({ treeId: 'not-a-uuid' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('treeId が未指定の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await getPhotos({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await getPhotos({ treeId: 'not-a-uuid' });

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

      const result = await getPhotos(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });

    it('他人のツリーの場合 FORBIDDEN を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: null, error: null },
      });

      const result = await getPhotos(validInput);

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

    it('写真一覧取得でエラーが発生した場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        photosResult: { data: null, error: { code: '42000', message: 'DB error' } },
      });

      const result = await getPhotos(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: 写真一覧取得
  // ---------------------------------------------------------------------------
  describe('正常系', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('写真一覧を取得して返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        photosResult: {
          data: [
            {
              id: PHOTO_ID,
              storage_object_key: `${USER_ID}/${TREE_ID}/photo.jpg`,
              mime_type: 'image/jpeg',
              byte_size: 102400,
              taken_year: 2020,
              taken_month: 6,
              taken_day: 15,
              caption: 'テストキャプション',
              created_at: '2024-01-01T00:00:00Z',
              photo_person_link: [{ person_id: PERSON_ID }],
            },
          ],
          error: null,
        },
      });

      const result = await getPhotos(validInput);

      expect(result).toEqual({
        ok: true,
        data: [
          {
            id: PHOTO_ID,
            storageObjectKey: `${USER_ID}/${TREE_ID}/photo.jpg`,
            mimeType: 'image/jpeg',
            byteSize: 102400,
            takenYear: 2020,
            takenMonth: 6,
            takenDay: 15,
            caption: 'テストキャプション',
            createdAt: '2024-01-01T00:00:00Z',
            personIds: [PERSON_ID],
          },
        ],
      });
    });

    it('写真が存在しない場合に空配列を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        photosResult: { data: [], error: null },
      });

      const result = await getPhotos(validInput);

      expect(result).toEqual({ ok: true, data: [] });
    });

    it('photos が null の場合も空配列を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        photosResult: { data: null, error: null },
      });

      const result = await getPhotos(validInput);

      expect(result).toEqual({ ok: true, data: [] });
    });

    it('スネークケース → キャメルケースのマッピングが正しく行われること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        photosResult: {
          data: [
            {
              id: PHOTO_ID,
              storage_object_key: 'user/tree/file.png',
              mime_type: 'image/png',
              byte_size: 50000,
              taken_year: null,
              taken_month: null,
              taken_day: null,
              caption: null,
              created_at: '2024-06-01T12:00:00Z',
              photo_person_link: [],
            },
          ],
          error: null,
        },
      });

      const result = await getPhotos(validInput);

      if (!result.ok) throw new Error('Expected ok result');

      const photo = result.data[0];
      expect(photo.storageObjectKey).toBe('user/tree/file.png');
      expect(photo.mimeType).toBe('image/png');
      expect(photo.byteSize).toBe(50000);
      expect(photo.takenYear).toBeNull();
      expect(photo.takenMonth).toBeNull();
      expect(photo.takenDay).toBeNull();
      expect(photo.caption).toBeNull();
      expect(photo.createdAt).toBe('2024-06-01T12:00:00Z');
      expect(photo.personIds).toEqual([]);
    });

    it('photo_person_link が null の場合 personIds が空配列になること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        photosResult: {
          data: [
            {
              id: PHOTO_ID,
              storage_object_key: 'user/tree/file.jpg',
              mime_type: 'image/jpeg',
              byte_size: 10000,
              taken_year: null,
              taken_month: null,
              taken_day: null,
              caption: null,
              created_at: '2024-01-01T00:00:00Z',
              photo_person_link: null,
            },
          ],
          error: null,
        },
      });

      const result = await getPhotos(validInput);

      if (!result.ok) throw new Error('Expected ok result');
      expect(result.data[0].personIds).toEqual([]);
    });
  });
});
