/**
 * handlers.ts ユニットテスト
 *
 * テスト対象:
 *   - handleCheckoutSessionCompleted
 *   - handleSubscriptionCreated
 *   - handleSubscriptionUpdated
 *   - handleSubscriptionDeleted
 *   - handleInvoicePaymentFailed
 *   - handleInvoicePaymentSucceeded
 *
 * 方針:
 *   - Supabase クライアントは jest.fn() チェーンで構築したスタブを直接渡す
 *   - Stripe オブジェクトは duck typing で構築 (as unknown as Stripe.Event)
 *   - 外部モジュールの依存はなし (handlers.ts 自体には server-only import なし)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  handleCheckoutSessionCompleted,
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
} from '../handlers';
import { WebhookBusinessError } from '../errors';

// ---------------------------------------------------------------------------
// Supabase スタブ ファクトリ
// ---------------------------------------------------------------------------

interface SupabaseStubOpts {
  selectResult?: { data: unknown; error: unknown };
  updateResult?: { error: unknown; count?: number };
  upsertResult?: { error: unknown };
}

interface SupabaseStubSpies {
  from: jest.Mock;
  select: jest.Mock;
  eqSelect: jest.Mock;
  maybeSingleSelect: jest.Mock;
  update: jest.Mock;
  eqUpdate: jest.Mock;
  upsert: jest.Mock;
}

function buildSupabaseStub(opts: SupabaseStubOpts = {}): {
  supabase: SupabaseClient;
  spies: SupabaseStubSpies;
} {
  // SELECT 用: from('plan').select(...).eq(...).maybeSingle()
  const maybeSingleSelect = jest
    .fn()
    .mockResolvedValue(opts.selectResult ?? { data: { id: 'basic' }, error: null });
  const eqSelect = jest.fn().mockReturnValue({ maybeSingle: maybeSingleSelect });
  const select = jest.fn().mockReturnValue({ eq: eqSelect });

  // UPDATE 用: from('subscription').update(..., { count: 'exact' }).eq(...)
  const eqUpdate = jest
    .fn()
    .mockResolvedValue(opts.updateResult ?? { error: null, count: 1 });
  const update = jest.fn().mockReturnValue({ eq: eqUpdate });

  // UPSERT 用: from('subscription').upsert(...)
  const upsert = jest
    .fn()
    .mockResolvedValue(opts.upsertResult ?? { error: null });

  const from = jest.fn((table: string) => {
    if (table === 'plan') return { select };
    if (table === 'subscription') return { update, upsert, select };
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    supabase: { from } as unknown as SupabaseClient,
    spies: { from, select, eqSelect, maybeSingleSelect, update, eqUpdate, upsert },
  };
}

// ---------------------------------------------------------------------------
// イベント ビルダー
// ---------------------------------------------------------------------------

function buildCheckoutSessionEvent(overrides: Partial<{
  id: string;
  customer: string | { id: string } | null;
  subscription: string | { id: string } | null;
  client_reference_id: string | null;
}> = {}): Stripe.Event {
  return {
    id: overrides.id ?? 'evt_001',
    type: 'checkout.session.completed',
    data: {
      object: {
        customer: 'customer' in overrides ? overrides.customer : 'cus_001',
        subscription: 'subscription' in overrides ? overrides.subscription : 'sub_001',
        client_reference_id: 'client_reference_id' in overrides ? overrides.client_reference_id : 'user_001',
      },
    },
  } as unknown as Stripe.Event;
}

function buildSubscriptionEvent(
  type: string,
  overrides: Partial<{
    id: string;
    customer: string | { id: string } | null;
    status: string;
    cancelAtPeriodEnd: boolean;
    priceId: string;
    currentPeriodEnd: number | null;
  }> = {}
): Stripe.Event {
  const priceId = overrides.priceId ?? 'price_basic_001';
  const currentPeriodEnd = 'currentPeriodEnd' in overrides ? overrides.currentPeriodEnd : 1800000000;

  return {
    id: overrides.id ?? 'evt_sub_001',
    type,
    data: {
      object: {
        id: 'sub_001',
        customer: 'customer' in overrides ? overrides.customer : 'cus_001',
        status: overrides.status ?? 'active',
        cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
        items: {
          data: [
            {
              price: { id: priceId },
              current_period_end: currentPeriodEnd,
            },
          ],
        },
      },
    },
  } as unknown as Stripe.Event;
}

function buildSubscriptionEventNoItems(type: string): Stripe.Event {
  return {
    id: 'evt_sub_noitems',
    type,
    data: {
      object: {
        id: 'sub_noitems',
        customer: 'cus_001',
        status: 'active',
        cancel_at_period_end: false,
        items: { data: [] },
      },
    },
  } as unknown as Stripe.Event;
}

function buildInvoiceEvent(
  type: string,
  overrides: Partial<{
    id: string;
    customer: string | { id: string } | null;
    hasSubscriptionDetails: boolean;
  }> = {}
): Stripe.Event {
  const hasDetails = overrides.hasSubscriptionDetails !== false;
  return {
    id: overrides.id ?? 'evt_inv_001',
    type,
    data: {
      object: {
        id: 'in_001',
        customer: 'customer' in overrides ? overrides.customer : 'cus_001',
        parent: hasDetails
          ? { subscription_details: { subscription: 'sub_001' } }
          : null,
      },
    },
  } as unknown as Stripe.Event;
}

// ---------------------------------------------------------------------------
// handleCheckoutSessionCompleted
// ---------------------------------------------------------------------------

describe('handleCheckoutSessionCompleted', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('正常系: client_reference_id, customer, subscription があれば subscription テーブルに upsert が呼ばれること', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const event = buildCheckoutSessionEvent();

    await handleCheckoutSessionCompleted(event, supabase);

    expect(spies.upsert).toHaveBeenCalledTimes(1);
  });

  it('upsert に渡るオブジェクトが { user_id, plan_id: "free", stripe_customer_id, stripe_subscription_id, status: "active" } であること', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const event = buildCheckoutSessionEvent({
      customer: 'cus_test',
      subscription: 'sub_test',
      client_reference_id: 'user_test',
    });

    await handleCheckoutSessionCompleted(event, supabase);

    expect(spies.upsert).toHaveBeenCalledWith(
      {
        user_id: 'user_test',
        plan_id: 'free',
        stripe_customer_id: 'cus_test',
        stripe_subscription_id: 'sub_test',
        status: 'active',
      },
      expect.anything()
    );
  });

  it('upsert の onConflict が "user_id" であること', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const event = buildCheckoutSessionEvent();

    await handleCheckoutSessionCompleted(event, supabase);

    expect(spies.upsert).toHaveBeenCalledWith(
      expect.anything(),
      { onConflict: 'user_id' }
    );
  });

  it('client_reference_id が null の場合は WebhookBusinessError を throw して upsert を呼ばないこと', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const event = buildCheckoutSessionEvent({ client_reference_id: null });

    await expect(handleCheckoutSessionCompleted(event, supabase)).rejects.toThrow(WebhookBusinessError);
    expect(spies.upsert).not.toHaveBeenCalled();
  });

  it('session.customer が null の場合は WebhookBusinessError を throw して upsert を呼ばないこと', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const event = buildCheckoutSessionEvent({ customer: null });

    await expect(handleCheckoutSessionCompleted(event, supabase)).rejects.toThrow(WebhookBusinessError);
    expect(spies.upsert).not.toHaveBeenCalled();
  });

  it('session.subscription が null の場合は WebhookBusinessError を throw して upsert を呼ばないこと', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const event = buildCheckoutSessionEvent({ subscription: null });

    await expect(handleCheckoutSessionCompleted(event, supabase)).rejects.toThrow(WebhookBusinessError);
    expect(spies.upsert).not.toHaveBeenCalled();
  });

  it('session.customer がオブジェクト型でも customer.id が抽出されて upsert に渡ること', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const event = buildCheckoutSessionEvent({ customer: { id: 'cus_obj_001' } });

    await handleCheckoutSessionCompleted(event, supabase);

    expect(spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_customer_id: 'cus_obj_001' }),
      expect.anything()
    );
  });

  it('session.subscription がオブジェクト型でも subscription.id が抽出されて upsert に渡ること', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const event = buildCheckoutSessionEvent({ subscription: { id: 'sub_obj_001' } });

    await handleCheckoutSessionCompleted(event, supabase);

    expect(spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_subscription_id: 'sub_obj_001' }),
      expect.anything()
    );
  });

  it('upsert で error が返った場合 throw new Error されること', async () => {
    const { supabase } = buildSupabaseStub({
      upsertResult: { error: { message: 'DB upsert error' } },
    });
    const event = buildCheckoutSessionEvent();

    await expect(handleCheckoutSessionCompleted(event, supabase)).rejects.toThrow(
      /DB error/
    );
  });
});

// ---------------------------------------------------------------------------
// handleSubscriptionCreated / handleSubscriptionUpdated (applySubscriptionState 経由)
// ---------------------------------------------------------------------------

describe('handleSubscriptionCreated / handleSubscriptionUpdated (applySubscriptionState)', () => {
  const handlers = [
    { name: 'handleSubscriptionCreated', fn: handleSubscriptionCreated, type: 'customer.subscription.created' },
    { name: 'handleSubscriptionUpdated', fn: handleSubscriptionUpdated, type: 'customer.subscription.updated' },
  ] as const;

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(handlers)('正常系: plan SELECT → UPDATE が成功すること ($name)', async ({ fn, type }) => {
    const { supabase, spies } = buildSupabaseStub({
      selectResult: { data: { id: 'basic' }, error: null },
      updateResult: { error: null, count: 1 },
    });
    const event = buildSubscriptionEvent(type);

    await fn(event, supabase);

    expect(spies.maybeSingleSelect).toHaveBeenCalledTimes(1);
    expect(spies.eqUpdate).toHaveBeenCalledTimes(1);
  });

  it.each(handlers)(
    'UPDATE に渡るオブジェクトが plan_id, stripe_subscription_id, status, current_period_end, cancel_at_period_end を含むこと ($name)',
    async ({ fn, type }) => {
      const { supabase, spies } = buildSupabaseStub({
        selectResult: { data: { id: 'basic' }, error: null },
        updateResult: { error: null, count: 1 },
      });
      const event = buildSubscriptionEvent(type, {
        status: 'active',
        cancelAtPeriodEnd: false,
        priceId: 'price_basic_001',
        currentPeriodEnd: 1800000000,
      });

      await fn(event, supabase);

      const updateArg = spies.update.mock.calls[0][0] as Record<string, unknown>;
      expect(updateArg).toMatchObject({
        plan_id: 'basic',
        stripe_subscription_id: 'sub_001',
        status: 'active',
        cancel_at_period_end: false,
      });
      // current_period_end は ISO 文字列
      expect(typeof updateArg.current_period_end).toBe('string');
      expect(updateArg.current_period_end).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  );

  it.each(handlers)('customer が null の場合は WebhookBusinessError を throw して plan も update も呼ばないこと ($name)', async ({ fn, type }) => {
    const { supabase, spies } = buildSupabaseStub();
    const event = buildSubscriptionEvent(type, { customer: null });

    await expect(fn(event, supabase)).rejects.toThrow(WebhookBusinessError);
    expect(spies.maybeSingleSelect).not.toHaveBeenCalled();
    expect(spies.eqUpdate).not.toHaveBeenCalled();
  });

  it.each(handlers)('price ID が取れない (items.data 空) 場合は WebhookBusinessError を throw すること ($name)', async ({ fn, type }) => {
    const { supabase, spies } = buildSupabaseStub();
    const event = buildSubscriptionEventNoItems(type);

    await expect(fn(event, supabase)).rejects.toThrow(WebhookBusinessError);
    expect(spies.maybeSingleSelect).not.toHaveBeenCalled();
    expect(spies.eqUpdate).not.toHaveBeenCalled();
  });

  it.each(handlers)('plan SELECT が error を返した場合 throw new Error されること ($name)', async ({ fn, type }) => {
    const { supabase } = buildSupabaseStub({
      selectResult: { data: null, error: { message: 'plan DB error' } },
    });
    const event = buildSubscriptionEvent(type);

    await expect(fn(event, supabase)).rejects.toThrow(/DB error/);
  });

  it.each(handlers)('plan が見つからない (data null) 場合は WebhookBusinessError を throw して UPDATE を呼ばないこと ($name)', async ({ fn, type }) => {
    const { supabase, spies } = buildSupabaseStub({
      selectResult: { data: null, error: null },
    });
    const event = buildSubscriptionEvent(type);

    await expect(fn(event, supabase)).rejects.toThrow(WebhookBusinessError);
    expect(spies.eqUpdate).not.toHaveBeenCalled();
  });

  it.each(handlers)('status が未知値 ("trialing") の場合は WebhookBusinessError を throw して UPDATE を呼ばないこと ($name)', async ({ fn, type }) => {
    const { supabase, spies } = buildSupabaseStub({
      selectResult: { data: { id: 'basic' }, error: null },
    });
    const event = buildSubscriptionEvent(type, { status: 'trialing' });

    await expect(fn(event, supabase)).rejects.toThrow(WebhookBusinessError);
    expect(spies.eqUpdate).not.toHaveBeenCalled();
  });

  it.each(handlers)('UPDATE で error が返った場合 throw new Error されること ($name)', async ({ fn, type }) => {
    const { supabase } = buildSupabaseStub({
      selectResult: { data: { id: 'basic' }, error: null },
      updateResult: { error: { message: 'update DB error' }, count: 0 },
    });
    const event = buildSubscriptionEvent(type);

    await expect(fn(event, supabase)).rejects.toThrow(/DB error/);
  });

  it.each(handlers)('UPDATE の count === 0 の場合は WebhookBusinessError を throw すること ($name)', async ({ fn, type }) => {
    const { supabase } = buildSupabaseStub({
      selectResult: { data: { id: 'basic' }, error: null },
      updateResult: { error: null, count: 0 },
    });
    const event = buildSubscriptionEvent(type);

    await expect(fn(event, supabase)).rejects.toThrow(WebhookBusinessError);
  });
});

// ---------------------------------------------------------------------------
// handleSubscriptionDeleted
// ---------------------------------------------------------------------------

describe('handleSubscriptionDeleted', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('正常系: customer ID で UPDATE が呼ばれ、Free プランのフィールドで更新されること', async () => {
    const { supabase, spies } = buildSupabaseStub({
      updateResult: { error: null, count: 1 },
    });
    const event = buildSubscriptionEvent('customer.subscription.deleted', {
      customer: 'cus_del_001',
    });

    await handleSubscriptionDeleted(event, supabase);

    expect(spies.eqUpdate).toHaveBeenCalledWith('stripe_customer_id', 'cus_del_001');
    const updateArg = spies.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg).toMatchObject({
      plan_id: 'free',
      stripe_subscription_id: null,
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: null,
    });
  });

  it('downgraded_at が現在時刻の ISO 文字列として含まれること', async () => {
    const { supabase, spies } = buildSupabaseStub({
      updateResult: { error: null, count: 1 },
    });
    const event = buildSubscriptionEvent('customer.subscription.deleted');

    await handleSubscriptionDeleted(event, supabase);

    const updateArg = spies.update.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof updateArg.downgraded_at).toBe('string');
    expect(updateArg.downgraded_at as string).toMatch(/^\d{4}/);
  });

  it('customer が null の場合は WebhookBusinessError を throw すること', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const event = buildSubscriptionEvent('customer.subscription.deleted', { customer: null });

    await expect(handleSubscriptionDeleted(event, supabase)).rejects.toThrow(WebhookBusinessError);
    expect(spies.eqUpdate).not.toHaveBeenCalled();
  });

  it('UPDATE で error が返った場合 throw new Error されること', async () => {
    const { supabase } = buildSupabaseStub({
      updateResult: { error: { message: 'del update error' }, count: 0 },
    });
    const event = buildSubscriptionEvent('customer.subscription.deleted');

    await expect(handleSubscriptionDeleted(event, supabase)).rejects.toThrow(/DB error/);
  });

  it('UPDATE の count === 0 の場合は WebhookBusinessError を throw すること', async () => {
    const { supabase } = buildSupabaseStub({
      updateResult: { error: null, count: 0 },
    });
    const event = buildSubscriptionEvent('customer.subscription.deleted');

    await expect(handleSubscriptionDeleted(event, supabase)).rejects.toThrow(WebhookBusinessError);
  });

  it('customer がオブジェクト型でも customer.id が抽出されて UPDATE が呼ばれること', async () => {
    const { supabase, spies } = buildSupabaseStub({
      updateResult: { error: null, count: 1 },
    });
    const event = buildSubscriptionEvent('customer.subscription.deleted', {
      customer: { id: 'cus_obj_del' },
    });

    await handleSubscriptionDeleted(event, supabase);

    expect(spies.eqUpdate).toHaveBeenCalledWith('stripe_customer_id', 'cus_obj_del');
  });
});

// ---------------------------------------------------------------------------
// handleInvoicePaymentFailed
// ---------------------------------------------------------------------------

describe('handleInvoicePaymentFailed', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('正常系: subscription_details があれば UPDATE が { status: "past_due" } で呼ばれること', async () => {
    const { supabase, spies } = buildSupabaseStub({
      updateResult: { error: null, count: 1 },
    });
    const event = buildInvoiceEvent('invoice.payment_failed', { hasSubscriptionDetails: true });

    await handleInvoicePaymentFailed(event, supabase);

    expect(spies.update).toHaveBeenCalledWith({ status: 'past_due' }, { count: 'exact' });
    expect(spies.eqUpdate).toHaveBeenCalledWith('stripe_customer_id', 'cus_001');
  });

  it('invoice.parent.subscription_details が無い場合は info ログのみで UPDATE を呼ばないこと', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const event = buildInvoiceEvent('invoice.payment_failed', { hasSubscriptionDetails: false });

    await handleInvoicePaymentFailed(event, supabase);

    expect(infoSpy).toHaveBeenCalled();
    expect(spies.eqUpdate).not.toHaveBeenCalled();
  });

  it('invoice.parent が null の場合も info ログのみで UPDATE を呼ばないこと', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    // parent: null のイベントを直接作る
    const event = {
      id: 'evt_inv_null_parent',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_null',
          customer: 'cus_001',
          parent: null,
        },
      },
    } as unknown as Stripe.Event;

    await handleInvoicePaymentFailed(event, supabase);

    expect(infoSpy).toHaveBeenCalled();
    expect(spies.eqUpdate).not.toHaveBeenCalled();
  });

  it('customer が null の場合は WebhookBusinessError を throw すること', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const event = buildInvoiceEvent('invoice.payment_failed', { customer: null, hasSubscriptionDetails: true });

    await expect(handleInvoicePaymentFailed(event, supabase)).rejects.toThrow(WebhookBusinessError);
    expect(spies.eqUpdate).not.toHaveBeenCalled();
  });

  it('UPDATE で error が返った場合 throw new Error されること', async () => {
    const { supabase } = buildSupabaseStub({
      updateResult: { error: { message: 'failed update error' }, count: 0 },
    });
    const event = buildInvoiceEvent('invoice.payment_failed', { hasSubscriptionDetails: true });

    await expect(handleInvoicePaymentFailed(event, supabase)).rejects.toThrow(/DB error/);
  });

  it('UPDATE の count === 0 の場合は WebhookBusinessError を throw すること', async () => {
    const { supabase } = buildSupabaseStub({
      updateResult: { error: null, count: 0 },
    });
    const event = buildInvoiceEvent('invoice.payment_failed', { hasSubscriptionDetails: true });

    await expect(handleInvoicePaymentFailed(event, supabase)).rejects.toThrow(WebhookBusinessError);
  });
});

// ---------------------------------------------------------------------------
// handleInvoicePaymentSucceeded
// ---------------------------------------------------------------------------

describe('handleInvoicePaymentSucceeded', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('正常系: subscription_details があれば UPDATE が { status: "active" } で呼ばれること', async () => {
    const { supabase, spies } = buildSupabaseStub({
      updateResult: { error: null, count: 1 },
    });
    const event = buildInvoiceEvent('invoice.payment_succeeded', { hasSubscriptionDetails: true });

    await handleInvoicePaymentSucceeded(event, supabase);

    expect(spies.update).toHaveBeenCalledWith({ status: 'active' }, { count: 'exact' });
    expect(spies.eqUpdate).toHaveBeenCalledWith('stripe_customer_id', 'cus_001');
  });

  it('invoice.parent.subscription_details が無い場合は info ログのみで UPDATE を呼ばないこと', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const event = buildInvoiceEvent('invoice.payment_succeeded', { hasSubscriptionDetails: false });

    await handleInvoicePaymentSucceeded(event, supabase);

    expect(infoSpy).toHaveBeenCalled();
    expect(spies.eqUpdate).not.toHaveBeenCalled();
  });

  it('invoice.parent が null の場合も info ログのみで UPDATE を呼ばないこと', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const event = {
      id: 'evt_inv_succ_null_parent',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_succ_null',
          customer: 'cus_001',
          parent: null,
        },
      },
    } as unknown as Stripe.Event;

    await handleInvoicePaymentSucceeded(event, supabase);

    expect(infoSpy).toHaveBeenCalled();
    expect(spies.eqUpdate).not.toHaveBeenCalled();
  });

  it('customer が null の場合は WebhookBusinessError を throw すること', async () => {
    const { supabase, spies } = buildSupabaseStub();
    const event = buildInvoiceEvent('invoice.payment_succeeded', { customer: null, hasSubscriptionDetails: true });

    await expect(handleInvoicePaymentSucceeded(event, supabase)).rejects.toThrow(WebhookBusinessError);
    expect(spies.eqUpdate).not.toHaveBeenCalled();
  });

  it('UPDATE で error が返った場合 throw new Error されること', async () => {
    const { supabase } = buildSupabaseStub({
      updateResult: { error: { message: 'succeeded update error' }, count: 0 },
    });
    const event = buildInvoiceEvent('invoice.payment_succeeded', { hasSubscriptionDetails: true });

    await expect(handleInvoicePaymentSucceeded(event, supabase)).rejects.toThrow(/DB error/);
  });

  it('UPDATE の count === 0 の場合は WebhookBusinessError を throw すること', async () => {
    const { supabase } = buildSupabaseStub({
      updateResult: { error: null, count: 0 },
    });
    const event = buildInvoiceEvent('invoice.payment_succeeded', { hasSubscriptionDetails: true });

    await expect(handleInvoicePaymentSucceeded(event, supabase)).rejects.toThrow(WebhookBusinessError);
  });
});
