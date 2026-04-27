/**
 * Stripe Webhook イベントハンドラ (stub)
 *
 * このファイルは ef6.4 で作成したスタブ実装です。
 * 各ハンドラの具体的な業務ロジックは ef6.5 で実装されます。
 *
 * シグネチャ: async function handleXxx(event: Stripe.Event, supabase: SupabaseClient): Promise<void>
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

/**
 * checkout.session.completed
 * subscription を取得し、Customer ID と Subscription ID を subscription テーブルに反映する。
 */
export async function handleCheckoutSessionCompleted(
  event: Stripe.Event,
  supabase: SupabaseClient
): Promise<void> {
  console.log('[stub] handleCheckoutSessionCompleted', event.id, supabase);
}

/**
 * customer.subscription.created
 * 新規契約。subscription 行を status='active' で更新する。
 */
export async function handleSubscriptionCreated(
  event: Stripe.Event,
  supabase: SupabaseClient
): Promise<void> {
  console.log('[stub] handleSubscriptionCreated', event.id, supabase);
}

/**
 * customer.subscription.updated
 * プラン変更 / cancel_at_period_end の反映。current_period_end を更新する。
 */
export async function handleSubscriptionUpdated(
  event: Stripe.Event,
  supabase: SupabaseClient
): Promise<void> {
  console.log('[stub] handleSubscriptionUpdated', event.id, supabase);
}

/**
 * customer.subscription.deleted
 * 期間終了 or リトライ失敗 → Free に降格。downgraded_at = now()、stripe_subscription_id = null。
 */
export async function handleSubscriptionDeleted(
  event: Stripe.Event,
  supabase: SupabaseClient
): Promise<void> {
  console.log('[stub] handleSubscriptionDeleted', event.id, supabase);
}

/**
 * invoice.payment_failed
 * status='past_due' に更新する。
 */
export async function handleInvoicePaymentFailed(
  event: Stripe.Event,
  supabase: SupabaseClient
): Promise<void> {
  console.log('[stub] handleInvoicePaymentFailed', event.id, supabase);
}

/**
 * invoice.payment_succeeded
 * status='active' に戻す。
 */
export async function handleInvoicePaymentSucceeded(
  event: Stripe.Event,
  supabase: SupabaseClient
): Promise<void> {
  console.log('[stub] handleInvoicePaymentSucceeded', event.id, supabase);
}
