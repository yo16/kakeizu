/**
 * routeWebhookEvent - ルーター ユニットテスト
 *
 * テスト方針: handlers をすべてモックして、ルーターが
 * event.type に応じて正しいハンドラへ振り分けるロジックのみを検証する。
 */

// server-only モジュールを空オブジェクトとしてモック
jest.mock('server-only', () => ({}));

// handlers をすべてモック
jest.mock('@/features/billing/webhook/handlers', () => ({
  handleCheckoutSessionCompleted: jest.fn(),
  handleSubscriptionCreated: jest.fn(),
  handleSubscriptionUpdated: jest.fn(),
  handleSubscriptionDeleted: jest.fn(),
  handleInvoicePaymentFailed: jest.fn(),
  handleInvoicePaymentSucceeded: jest.fn(),
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { routeWebhookEvent } from '../router';
import {
  handleCheckoutSessionCompleted,
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
  handleSubscriptionCreated,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from '@/features/billing/webhook/handlers';

const mockHandleCheckoutSessionCompleted = handleCheckoutSessionCompleted as jest.MockedFunction<typeof handleCheckoutSessionCompleted>;
const mockHandleSubscriptionCreated = handleSubscriptionCreated as jest.MockedFunction<typeof handleSubscriptionCreated>;
const mockHandleSubscriptionUpdated = handleSubscriptionUpdated as jest.MockedFunction<typeof handleSubscriptionUpdated>;
const mockHandleSubscriptionDeleted = handleSubscriptionDeleted as jest.MockedFunction<typeof handleSubscriptionDeleted>;
const mockHandleInvoicePaymentFailed = handleInvoicePaymentFailed as jest.MockedFunction<typeof handleInvoicePaymentFailed>;
const mockHandleInvoicePaymentSucceeded = handleInvoicePaymentSucceeded as jest.MockedFunction<typeof handleInvoicePaymentSucceeded>;

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/**
 * Stripe.Event 最小オブジェクトを生成する。
 */
function buildEvent(type: string, id = 'evt_test_001'): Stripe.Event {
  return {
    id,
    type,
    object: 'event',
    api_version: '2024-06-20',
    created: 1700000000,
    data: { object: {} as Stripe.Event.Data['object'] },
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as unknown as Stripe.Event;
}

/**
 * Supabase クライアントのスタブを生成する。
 */
function buildSupabaseStub(): SupabaseClient {
  return {} as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// テスト前後のリセット
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // 各ハンドラはデフォルトで正常終了
  mockHandleCheckoutSessionCompleted.mockResolvedValue(undefined);
  mockHandleSubscriptionCreated.mockResolvedValue(undefined);
  mockHandleSubscriptionUpdated.mockResolvedValue(undefined);
  mockHandleSubscriptionDeleted.mockResolvedValue(undefined);
  mockHandleInvoicePaymentFailed.mockResolvedValue(undefined);
  mockHandleInvoicePaymentSucceeded.mockResolvedValue(undefined);
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// routeWebhookEvent - イベントルーティング
// ---------------------------------------------------------------------------

describe('routeWebhookEvent - イベントルーティング', () => {
  it('checkout.session.completed イベントで handleCheckoutSessionCompleted が呼ばれること', async () => {
    const event = buildEvent('checkout.session.completed');
    const supabase = buildSupabaseStub();

    await routeWebhookEvent(event, supabase);

    expect(mockHandleCheckoutSessionCompleted).toHaveBeenCalledTimes(1);
  });

  it('customer.subscription.created イベントで handleSubscriptionCreated が呼ばれること', async () => {
    const event = buildEvent('customer.subscription.created');
    const supabase = buildSupabaseStub();

    await routeWebhookEvent(event, supabase);

    expect(mockHandleSubscriptionCreated).toHaveBeenCalledTimes(1);
  });

  it('customer.subscription.updated イベントで handleSubscriptionUpdated が呼ばれること', async () => {
    const event = buildEvent('customer.subscription.updated');
    const supabase = buildSupabaseStub();

    await routeWebhookEvent(event, supabase);

    expect(mockHandleSubscriptionUpdated).toHaveBeenCalledTimes(1);
  });

  it('customer.subscription.deleted イベントで handleSubscriptionDeleted が呼ばれること', async () => {
    const event = buildEvent('customer.subscription.deleted');
    const supabase = buildSupabaseStub();

    await routeWebhookEvent(event, supabase);

    expect(mockHandleSubscriptionDeleted).toHaveBeenCalledTimes(1);
  });

  it('invoice.payment_failed イベントで handleInvoicePaymentFailed が呼ばれること', async () => {
    const event = buildEvent('invoice.payment_failed');
    const supabase = buildSupabaseStub();

    await routeWebhookEvent(event, supabase);

    expect(mockHandleInvoicePaymentFailed).toHaveBeenCalledTimes(1);
  });

  it('invoice.payment_succeeded イベントで handleInvoicePaymentSucceeded が呼ばれること', async () => {
    const event = buildEvent('invoice.payment_succeeded');
    const supabase = buildSupabaseStub();

    await routeWebhookEvent(event, supabase);

    expect(mockHandleInvoicePaymentSucceeded).toHaveBeenCalledTimes(1);
  });

  it('対象外イベント (customer.created) では何のハンドラも呼ばれず、エラーも throw されないこと', async () => {
    const event = buildEvent('customer.created');
    const supabase = buildSupabaseStub();

    await expect(routeWebhookEvent(event, supabase)).resolves.toBeUndefined();

    expect(mockHandleCheckoutSessionCompleted).not.toHaveBeenCalled();
    expect(mockHandleSubscriptionCreated).not.toHaveBeenCalled();
    expect(mockHandleSubscriptionUpdated).not.toHaveBeenCalled();
    expect(mockHandleSubscriptionDeleted).not.toHaveBeenCalled();
    expect(mockHandleInvoicePaymentFailed).not.toHaveBeenCalled();
    expect(mockHandleInvoicePaymentSucceeded).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// routeWebhookEvent - ハンドラへの引数渡し
// ---------------------------------------------------------------------------

describe('routeWebhookEvent - ハンドラへの引数渡し', () => {
  it('checkout.session.completed ハンドラに event と supabase の 2 引数が渡ること', async () => {
    const event = buildEvent('checkout.session.completed', 'evt_args_001');
    const supabase = buildSupabaseStub();

    await routeWebhookEvent(event, supabase);

    expect(mockHandleCheckoutSessionCompleted).toHaveBeenCalledWith(event, supabase);
  });

  it('customer.subscription.created ハンドラに event と supabase の 2 引数が渡ること', async () => {
    const event = buildEvent('customer.subscription.created', 'evt_args_002');
    const supabase = buildSupabaseStub();

    await routeWebhookEvent(event, supabase);

    expect(mockHandleSubscriptionCreated).toHaveBeenCalledWith(event, supabase);
  });

  it('customer.subscription.updated ハンドラに event と supabase の 2 引数が渡ること', async () => {
    const event = buildEvent('customer.subscription.updated', 'evt_args_003');
    const supabase = buildSupabaseStub();

    await routeWebhookEvent(event, supabase);

    expect(mockHandleSubscriptionUpdated).toHaveBeenCalledWith(event, supabase);
  });

  it('customer.subscription.deleted ハンドラに event と supabase の 2 引数が渡ること', async () => {
    const event = buildEvent('customer.subscription.deleted', 'evt_args_004');
    const supabase = buildSupabaseStub();

    await routeWebhookEvent(event, supabase);

    expect(mockHandleSubscriptionDeleted).toHaveBeenCalledWith(event, supabase);
  });

  it('invoice.payment_failed ハンドラに event と supabase の 2 引数が渡ること', async () => {
    const event = buildEvent('invoice.payment_failed', 'evt_args_005');
    const supabase = buildSupabaseStub();

    await routeWebhookEvent(event, supabase);

    expect(mockHandleInvoicePaymentFailed).toHaveBeenCalledWith(event, supabase);
  });

  it('invoice.payment_succeeded ハンドラに event と supabase の 2 引数が渡ること', async () => {
    const event = buildEvent('invoice.payment_succeeded', 'evt_args_006');
    const supabase = buildSupabaseStub();

    await routeWebhookEvent(event, supabase);

    expect(mockHandleInvoicePaymentSucceeded).toHaveBeenCalledWith(event, supabase);
  });
});
