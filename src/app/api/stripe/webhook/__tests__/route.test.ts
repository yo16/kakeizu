/**
 * @jest-environment node
 */

/**
 * POST /api/stripe/webhook - Route Handler ユニットテスト
 *
 * テスト方針: Stripe API / Supabase / ルーター をすべてモックして
 * Route Handler 自体のフロー制御ロジックのみを検証する。
 *
 * 環境: Node 環境を指定 (next/server の Request グローバルが必要なため、jsdom では起動できない)
 */

// server-only モジュールを空オブジェクトとしてモック
jest.mock('server-only', () => ({}));

// Supabase Service Role クライアントをモック
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(),
}));

// Stripe SDK をモック
jest.mock('@/lib/stripe/server', () => ({
  getStripe: jest.fn(),
}));

// billing/webhook ルーターをモック (route.test.ts ではルーター自体の動作は検証しない)
jest.mock('@/features/billing/webhook', () => ({
  routeWebhookEvent: jest.fn(),
}));

// WebhookBusinessError は実装そのものを使用する (モックしない)
import type { NextRequest } from 'next/server';
import { POST, runtime } from '../route';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { routeWebhookEvent } from '@/features/billing/webhook';
import { WebhookBusinessError } from '@/features/billing/webhook/errors';

const mockCreateServiceRoleClient = createServiceRoleClient as jest.MockedFunction<typeof createServiceRoleClient>;
const mockGetStripe = getStripe as jest.MockedFunction<typeof getStripe>;
const mockRouteWebhookEvent = routeWebhookEvent as jest.MockedFunction<typeof routeWebhookEvent>;

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

const mockInsert = jest.fn();
const mockFrom = jest.fn(() => ({ insert: mockInsert }));
const mockConstructEvent = jest.fn();

/**
 * NextRequest のスタブを生成する。
 */
function buildRequest({ body, signature }: { body: string; signature?: string }): NextRequest {
  return {
    text: jest.fn().mockResolvedValue(body),
    headers: {
      get: jest.fn((name: string) => (name === 'stripe-signature' ? (signature ?? null) : null)),
    },
  } as unknown as NextRequest;
}

/**
 * テスト用の Stripe.Event 最小オブジェクトを生成する。
 */
function buildStripeEvent(overrides: Partial<{ id: string; type: string }> = {}) {
  return {
    id: overrides.id ?? 'evt_test_001',
    type: overrides.type ?? 'checkout.session.completed',
    object: 'event',
  };
}

// ---------------------------------------------------------------------------
// テスト前後のリセット
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // デフォルト環境変数を設定
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
  // デフォルトで INSERT 成功 (エラーなし) を返す
  mockInsert.mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({ insert: mockInsert });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateServiceRoleClient.mockReturnValue({ from: mockFrom } as any);
  // デフォルトで routeWebhookEvent は正常終了
  mockRouteWebhookEvent.mockResolvedValue(undefined);
  // デフォルトで constructEvent は正常なイベントを返す
  mockConstructEvent.mockReturnValue(buildStripeEvent());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockGetStripe.mockReturnValue({
    webhooks: { constructEvent: mockConstructEvent },
  } as any);
  // console をスパイして出力を抑制
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Runtime 設定の検証
// ---------------------------------------------------------------------------

describe('Runtime 設定', () => {
  it('runtime が "nodejs" であること', () => {
    expect(runtime).toBe('nodejs');
  });
});

// ---------------------------------------------------------------------------
// POST 動作の検証: 環境変数チェック
// ---------------------------------------------------------------------------

describe('POST - 環境変数チェック', () => {
  it('STRIPE_WEBHOOK_SECRET 未設定の場合 500 を返す', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const req = buildRequest({ body: '{}', signature: 'sig_test' });

    const response = await POST(req);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Webhook not configured' });
  });

  it('STRIPE_WEBHOOK_SECRET 未設定の場合 getStripe() を呼ばないこと', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const req = buildRequest({ body: '{}', signature: 'sig_test' });

    await POST(req);

    expect(mockGetStripe).not.toHaveBeenCalled();
  });

  it('STRIPE_WEBHOOK_SECRET 未設定の場合 createServiceRoleClient() を呼ばないこと', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const req = buildRequest({ body: '{}', signature: 'sig_test' });

    await POST(req);

    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST 動作の検証: 署名検証
// ---------------------------------------------------------------------------

describe('POST - 署名検証', () => {
  it('stripe-signature ヘッダーがない場合 400 を返す', async () => {
    const req = buildRequest({ body: '{}' });

    const response = await POST(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: 'Invalid signature' });
  });

  it('stripe-signature ヘッダーがない場合 constructEvent を呼ばないこと', async () => {
    const req = buildRequest({ body: '{}' });

    await POST(req);

    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it('constructEvent が throw した場合 (不正署名) 400 を返す', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });
    const req = buildRequest({ body: '{}', signature: 'invalid_sig' });

    const response = await POST(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: 'Invalid signature' });
  });

  it('不正署名時に createServiceRoleClient() を呼ばないこと', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const req = buildRequest({ body: '{}', signature: 'invalid_sig' });

    await POST(req);

    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('req.text() で取得した rawBody が constructEvent に渡ること', async () => {
    const rawBody = '{"id":"evt_001","type":"checkout.session.completed"}';
    const req = buildRequest({ body: rawBody, signature: 'sig_valid' });

    await POST(req);

    expect(mockConstructEvent).toHaveBeenCalledWith(
      rawBody,
      'sig_valid',
      'whsec_test_secret'
    );
  });

  it('stripe-signature ヘッダー値が constructEvent に渡ること', async () => {
    const signature = 't=1234567890,v1=abcdefabcdef';
    const req = buildRequest({ body: '{}', signature });

    await POST(req);

    expect(mockConstructEvent).toHaveBeenCalledWith(
      expect.any(String),
      signature,
      expect.any(String)
    );
  });
});

// ---------------------------------------------------------------------------
// POST 動作の検証: Stripe SDK 初期化
// ---------------------------------------------------------------------------

describe('POST - Stripe SDK 初期化', () => {
  it('getStripe() が throw した場合 500 を返す', async () => {
    mockGetStripe.mockImplementation(() => {
      throw new Error('STRIPE_SECRET_KEY が設定されていません');
    });
    const req = buildRequest({ body: '{}', signature: 'sig_valid' });

    const response = await POST(req);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Webhook not configured' });
  });
});

// ---------------------------------------------------------------------------
// POST 動作の検証: 冪等性
// ---------------------------------------------------------------------------

describe('POST - 冪等性チェック', () => {
  it('INSERT 成功時に routeWebhookEvent が呼ばれ 200 を返す', async () => {
    mockInsert.mockResolvedValue({ error: null });
    const req = buildRequest({ body: '{}', signature: 'sig_valid' });

    const response = await POST(req);

    expect(mockRouteWebhookEvent).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ received: true });
  });

  it('INSERT で UNIQUE 違反 (code === "23505") の場合 200 を返す', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key value' } });
    const req = buildRequest({ body: '{}', signature: 'sig_valid' });

    const response = await POST(req);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ received: true });
  });

  it('INSERT で UNIQUE 違反 (code === "23505") の場合 routeWebhookEvent を呼ばないこと', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key value' } });
    const req = buildRequest({ body: '{}', signature: 'sig_valid' });

    await POST(req);

    expect(mockRouteWebhookEvent).not.toHaveBeenCalled();
  });

  it('INSERT で UNIQUE 違反以外のエラー (code === "08006") が返った場合 500 を返す', async () => {
    mockInsert.mockResolvedValue({ error: { code: '08006', message: 'connection failure' } });
    const req = buildRequest({ body: '{}', signature: 'sig_valid' });

    const response = await POST(req);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Internal error' });
  });

  it('INSERT で UNIQUE 違反以外のエラー時に routeWebhookEvent を呼ばないこと', async () => {
    mockInsert.mockResolvedValue({ error: { code: '08006', message: 'connection failure' } });
    const req = buildRequest({ body: '{}', signature: 'sig_valid' });

    await POST(req);

    expect(mockRouteWebhookEvent).not.toHaveBeenCalled();
  });

  it('INSERT に渡る payload が { stripe_event_id, type, payload } の形であること', async () => {
    const event = buildStripeEvent({ id: 'evt_payload_test', type: 'checkout.session.completed' });
    mockConstructEvent.mockReturnValue(event);
    const req = buildRequest({ body: '{}', signature: 'sig_valid' });

    await POST(req);

    expect(mockInsert).toHaveBeenCalledWith({
      stripe_event_id: 'evt_payload_test',
      type: 'checkout.session.completed',
      payload: event,
    });
  });
});

// ---------------------------------------------------------------------------
// POST 動作の検証: ルーター呼び出し
// ---------------------------------------------------------------------------

describe('POST - ルーター呼び出し', () => {
  it('ルーターが正常終了した場合 200 を返す', async () => {
    mockRouteWebhookEvent.mockResolvedValue(undefined);
    const req = buildRequest({ body: '{}', signature: 'sig_valid' });

    const response = await POST(req);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ received: true });
  });

  it('ルーターが WebhookBusinessError を throw した場合 200 を返す (業務エラー)', async () => {
    mockRouteWebhookEvent.mockRejectedValueOnce(new WebhookBusinessError('test business error'));
    const req = buildRequest({ body: '{}', signature: 'sig_valid' });

    const response = await POST(req);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ received: true });
  });

  it('ルーターが通常の Error を throw した場合 500 を返す (想定外エラー)', async () => {
    mockRouteWebhookEvent.mockRejectedValueOnce(new Error('unexpected internal error'));
    const req = buildRequest({ body: '{}', signature: 'sig_valid' });

    const response = await POST(req);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Internal error' });
  });

  it('ルーターが Error 以外 (throw "string") を throw した場合 500 を返す (想定外エラー)', async () => {
    mockRouteWebhookEvent.mockRejectedValue('unexpected string error');
    const req = buildRequest({ body: '{}', signature: 'sig_valid' });

    const response = await POST(req);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Internal error' });
  });
});
