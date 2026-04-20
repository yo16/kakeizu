/**
 * TODO: Next.js Route Handler テストの Jest polyfill 設定は別タスクで対応
 * 現状: `ReferenceError: Request is not defined` で起動不可のため一時スキップ
 */

/**
 * POST /api/storage/signed-upload Route Handler のユニットテスト
 *
 * 認証・バリデーション・ファイルサイズ検証・MIME タイプ検証・
 * ツリー所有権確認・署名付き URL 発行 を検証する。
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

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// テスト用 UUID
const USER_ID = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

const SIGNED_URL = 'https://storage.example.com/signed-url-token';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * NextRequest を組み立てるヘルパー。
 */
function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/storage/signed-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Supabase クライアントのモックを構築するヘルパー。
 */
function buildSupabaseMock(options: {
  ownershipResult: { data: unknown; error: unknown };
  signedUrlResult?: { data: unknown; error: unknown };
}) {
  const {
    ownershipResult,
    signedUrlResult = {
      data: { signedUrl: SIGNED_URL, token: 'token', path: 'path' },
      error: null,
    },
  } = options;

  const mockFrom = jest.fn().mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    const singleFn = jest.fn().mockResolvedValue(ownershipResult);
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.single = singleFn;
    return chain;
  });

  const mockStorageFrom = jest.fn().mockReturnValue({
    createSignedUploadUrl: jest.fn().mockResolvedValue(signedUrlResult),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom, storage: { from: mockStorageFrom } } as any);
  return { mockFrom, mockStorageFrom };
}

/** 有効なリクエストボディ */
const validBody = {
  treeId: TREE_ID,
  fileName: 'photo.jpg',
  contentType: 'image/jpeg',
  byteSize: 1024,
};

describe.skip('POST /api/storage/signed-upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 未ログイン → 401
  // ---------------------------------------------------------------------------
  describe('未ログイン', () => {
    it('セッションが null の場合 401 を返すこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const response = await POST(buildRequest(validBody));

      expect(response.status).toBe(401);
    });

    it('未ログイン時のレスポンスボディに UNAUTHENTICATED コードが含まれること', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const response = await POST(buildRequest(validBody));
      const body = await response.json();

      expect(body).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await POST(buildRequest(validBody));

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // バリデーションエラー → 400
  // ---------------------------------------------------------------------------
  describe('バリデーションエラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('treeId が UUID 形式でない場合 400 を返すこと', async () => {
      const response = await POST(buildRequest({ ...validBody, treeId: 'not-a-uuid' }));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('fileName が空文字の場合 400 を返すこと', async () => {
      const response = await POST(buildRequest({ ...validBody, fileName: '' }));

      expect(response.status).toBe(400);
    });

    it('contentType が不正な MIME タイプの場合 400 を返すこと', async () => {
      const response = await POST(buildRequest({ ...validBody, contentType: 'image/gif' }));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('byteSize が 0 以下の場合 400 を返すこと', async () => {
      const response = await POST(buildRequest({ ...validBody, byteSize: 0 }));

      expect(response.status).toBe(400);
    });

    it('byteSize が未指定の場合 400 を返すこと', async () => {
      const { byteSize: _, ...withoutByteSize } = validBody;
      void _;
      const response = await POST(buildRequest(withoutByteSize));

      expect(response.status).toBe(400);
    });

    it('リクエストボディが不正な JSON の場合 400 を返すこと', async () => {
      setupAuthenticatedSession();
      const request = new NextRequest('http://localhost/api/storage/signed-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // ファイルサイズ超過 → 400
  // ---------------------------------------------------------------------------
  describe('ファイルサイズ超過', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('byteSize が 5MB 超過の場合 400 を返すこと', async () => {
      const oversizeBody = { ...validBody, byteSize: 5 * 1024 * 1024 + 1 };

      const response = await POST(buildRequest(oversizeBody));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR', field: 'byteSize' }),
      });
    });

    it('byteSize がちょうど 5MB の場合は許可されること', async () => {
      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
      });

      const exactSizeBody = { ...validBody, byteSize: 5 * 1024 * 1024 };
      const response = await POST(buildRequest(exactSizeBody));

      expect(response.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // MIME タイプ不正 → 400 (バリデーション)
  // ---------------------------------------------------------------------------
  describe('MIME タイプ不正', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('image/bmp は 400 を返すこと', async () => {
      const response = await POST(buildRequest({ ...validBody, contentType: 'image/bmp' }));

      expect(response.status).toBe(400);
    });

    it('application/pdf は 400 を返すこと', async () => {
      const response = await POST(buildRequest({ ...validBody, contentType: 'application/pdf' }));

      expect(response.status).toBe(400);
    });

    it('image/jpeg は許可されること', async () => {
      buildSupabaseMock({ ownershipResult: { data: { id: TREE_ID }, error: null } });

      const response = await POST(buildRequest({ ...validBody, contentType: 'image/jpeg' }));

      expect(response.status).toBe(200);
    });

    it('image/png は許可されること', async () => {
      buildSupabaseMock({ ownershipResult: { data: { id: TREE_ID }, error: null } });

      const response = await POST(buildRequest({ ...validBody, contentType: 'image/png' }));

      expect(response.status).toBe(200);
    });

    it('image/webp は許可されること', async () => {
      buildSupabaseMock({ ownershipResult: { data: { id: TREE_ID }, error: null } });

      const response = await POST(buildRequest({ ...validBody, contentType: 'image/webp' }));

      expect(response.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // 所有権なし → 403
  // ---------------------------------------------------------------------------
  describe('所有権なし', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('ツリーが存在しない場合 403 を返すこと', async () => {
      buildSupabaseMock({
        ownershipResult: { data: null, error: { code: 'PGRST116' } },
      });

      const response = await POST(buildRequest(validBody));

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });

    it('他人のツリーの場合 403 を返すこと', async () => {
      buildSupabaseMock({
        ownershipResult: { data: null, error: null },
      });

      const response = await POST(buildRequest(validBody));

      expect(response.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Storage エラー → 500
  // ---------------------------------------------------------------------------
  describe('Storage エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('createSignedUploadUrl が失敗した場合 500 を返すこと', async () => {
      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        signedUrlResult: { data: null, error: { message: 'Storage error' } },
      });

      const response = await POST(buildRequest(validBody));

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('signedData が null の場合 500 を返すこと', async () => {
      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        signedUrlResult: { data: null, error: null },
      });

      const response = await POST(buildRequest(validBody));

      expect(response.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系
  // ---------------------------------------------------------------------------
  describe('正常系', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('200 で uploadUrl と objectKey を返すこと', async () => {
      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
      });

      const response = await POST(buildRequest(validBody));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.data).toHaveProperty('uploadUrl', SIGNED_URL);
      expect(body.data).toHaveProperty('objectKey');
    });

    it('objectKey が {userId}/{treeId}/{uuid}.{ext} 形式であること', async () => {
      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
      });

      const response = await POST(buildRequest(validBody));
      const body = await response.json();

      // 形式: {userId}/{treeId}/{uuid}.{ext}
      const objectKey: string = body.data.objectKey;
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      const parts = objectKey.split('/');
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe(USER_ID);
      expect(parts[1]).toBe(TREE_ID);

      const [fileBaseName, ext] = parts[2].split('.');
      expect(uuidPattern.test(fileBaseName)).toBe(true);
      expect(ext).toBe('jpg'); // image/jpeg → jpg
    });

    it('image/png の場合 objectKey の拡張子が png になること', async () => {
      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
      });

      const response = await POST(buildRequest({ ...validBody, contentType: 'image/png' }));
      const body = await response.json();

      expect(body.data.objectKey).toMatch(/\.png$/);
    });

    it('image/webp の場合 objectKey の拡張子が webp になること', async () => {
      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
      });

      const response = await POST(buildRequest({ ...validBody, contentType: 'image/webp' }));
      const body = await response.json();

      expect(body.data.objectKey).toMatch(/\.webp$/);
    });
  });

  // ---------------------------------------------------------------------------
  // createSignedUploadUrl への objectKey 引数検証
  // ---------------------------------------------------------------------------
  describe('createSignedUploadUrl の objectKey 引数検証', () => {
    it('レスポンスの objectKey が Storage API の createSignedUploadUrl に渡されていること', async () => {
      const { mockStorageFrom } = buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
      });

      const response = await POST(buildRequest(validBody));
      const body = await response.json();

      const returnedObjectKey: string = body.data.objectKey;

      // storage.from('photos') が呼ばれた最初の戻り値の createSignedUploadUrl を取得
      const createSignedUploadUrlMock =
        mockStorageFrom.mock.results[0].value.createSignedUploadUrl as jest.Mock;
      const actualObjectKey = createSignedUploadUrlMock.mock.calls[0][0] as string;

      expect(actualObjectKey).toBe(returnedObjectKey);
    });

    it('createSignedUploadUrl に渡される objectKey が {userId}/{treeId}/{uuid}.{ext} 形式であること', async () => {
      const { mockStorageFrom } = buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
      });

      await POST(buildRequest(validBody));

      const createSignedUploadUrlMock =
        mockStorageFrom.mock.results[0].value.createSignedUploadUrl as jest.Mock;
      const objectKey = createSignedUploadUrlMock.mock.calls[0][0] as string;

      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const parts = objectKey.split('/');

      expect(parts.length).toBe(3);
      expect(parts[0]).toBe(USER_ID);
      expect(parts[1]).toBe(TREE_ID);
      const [fileBaseName, ext] = parts[2].split('.');
      expect(uuidPattern.test(fileBaseName)).toBe(true);
      expect(ext).toBe('jpg');
    });
  });
});
