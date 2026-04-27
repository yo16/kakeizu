/**
 * Stripe Webhook イベントルーター
 *
 * event.type に応じて対応するハンドラを呼び出す。
 * 対象外イベントはログのみ出力して正常終了する。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

import {
  handleCheckoutSessionCompleted,
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
  handleSubscriptionCreated,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from './handlers';

/**
 * Stripe イベントを受け取り、対応するハンドラへルーティングする。
 *
 * @param event Stripe イベントオブジェクト
 * @param supabase Service Role Supabase クライアント
 */
export async function routeWebhookEvent(
  event: Stripe.Event,
  supabase: SupabaseClient
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(event, supabase);
      break;

    case 'customer.subscription.created':
      await handleSubscriptionCreated(event, supabase);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event, supabase);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event, supabase);
      break;

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event, supabase);
      break;

    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event, supabase);
      break;

    default:
      console.info('[ignored] Stripe webhook event type not handled:', event.type, event.id);
      break;
  }
}
