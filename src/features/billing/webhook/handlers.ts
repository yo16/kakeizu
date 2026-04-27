/**
 * Stripe Webhook イベントハンドラ
 *
 * 各イベントに対応する業務ロジックを実装する。
 * シグネチャ: async function handleXxx(event: Stripe.Event, supabase: SupabaseClient): Promise<void>
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

// 型ガード: status が CHECK 制約のホワイトリストに含まれるか
const ALLOWED_STATUSES = ['active', 'past_due', 'canceled', 'incomplete'] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

function isAllowedStatus(s: string): s is AllowedStatus {
  return (ALLOWED_STATUSES as readonly string[]).includes(s);
}

/**
 * customer の展開オブジェクトまたは文字列から customer ID を取得する
 */
function extractCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  return customer.id;
}

/**
 * 共通: subscription の状態を subscription テーブルに反映する
 * (handleSubscriptionCreated / handleSubscriptionUpdated 両方から呼ぶ)
 */
async function applySubscriptionState(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId = extractCustomerId(subscription.customer);
  if (!customerId) {
    console.warn('[applySubscriptionState] subscription.customer が空です。subscription.id:', subscription.id);
    return;
  }

  // price ID を取得
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) {
    console.warn('[applySubscriptionState] subscription items から price ID を取得できません。subscription.id:', subscription.id);
    return;
  }

  // plan テーブルから stripe_price_id に対応する plan_id を取得
  const { data: planRow, error: planError } = await supabase
    .from('plan')
    .select('id')
    .eq('stripe_price_id', priceId)
    .maybeSingle();

  if (planError) {
    throw new Error(`[applySubscriptionState] DB error: plan テーブル取得失敗: ${planError.message}`);
  }

  if (!planRow) {
    console.warn('[applySubscriptionState] stripe_price_id に対応する plan が見つかりません。priceId:', priceId);
    return;
  }

  // status のバリデーション
  // 未知の status (例: trialing, paused) は DB の CHECK 制約に通らないため
  // フォールバックせずに警告を出して処理をスキップする
  // (フォールバックすると課金中ユーザーを誤って incomplete = Free 扱いしてしまうリスクがあるため)
  const rawStatus: string = subscription.status;
  if (!isAllowedStatus(rawStatus)) {
    console.warn(
      '[applySubscriptionState] 未対応の subscription.status:', rawStatus,
      '-> 処理をスキップします。subscription.id:', subscription.id
    );
    return;
  }
  const status: AllowedStatus = rawStatus;

  // current_period_end は items.data[0].current_period_end から取得 (UNIX 秒)
  const currentPeriodEndUnix = subscription.items.data[0]?.current_period_end;
  const currentPeriodEnd = typeof currentPeriodEndUnix === 'number'
    ? new Date(currentPeriodEndUnix * 1000).toISOString()
    : null;

  const { error: updateError, count } = await supabase
    .from('subscription')
    .update(
      {
        plan_id: planRow.id,
        stripe_subscription_id: subscription.id,
        status,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: subscription.cancel_at_period_end,
      },
      { count: 'exact' }
    )
    .eq('stripe_customer_id', customerId);

  if (updateError) {
    throw new Error(`[applySubscriptionState] DB error: subscription UPDATE 失敗: ${updateError.message}`);
  }

  if (count === 0) {
    console.warn('[applySubscriptionState] stripe_customer_id に対応する subscription 行が見つかりません。customerId:', customerId);
  }
}

/**
 * 共通: stripe_customer_id を条件に status のみ更新する
 * (handleInvoicePaymentFailed / handleInvoicePaymentSucceeded で使う)
 */
async function updateStatusByCustomer(
  supabase: SupabaseClient,
  customerId: string,
  status: AllowedStatus
): Promise<void> {
  const { error: updateError, count } = await supabase
    .from('subscription')
    .update({ status }, { count: 'exact' })
    .eq('stripe_customer_id', customerId);

  if (updateError) {
    throw new Error(`[updateStatusByCustomer] DB error: subscription UPDATE 失敗: ${updateError.message}`);
  }

  if (count === 0) {
    console.warn('[updateStatusByCustomer] stripe_customer_id に対応する subscription 行が見つかりません。customerId:', customerId);
  }
}

/**
 * checkout.session.completed
 * Customer ID と Subscription ID を subscription テーブルに反映し、status='active' に更新する。
 * plan_id の更新は customer.subscription.created/updated に委譲する。
 */
export async function handleCheckoutSessionCompleted(
  event: Stripe.Event,
  supabase: SupabaseClient
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;

  const userId = session.client_reference_id;
  if (!userId) {
    console.warn('[handleCheckoutSessionCompleted] client_reference_id が空です。event.id:', event.id);
    return;
  }

  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null;

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id ?? null;

  if (!customerId) {
    console.warn('[handleCheckoutSessionCompleted] session.customer が空です。event.id:', event.id);
    return;
  }

  if (!subscriptionId) {
    console.warn('[handleCheckoutSessionCompleted] session.subscription が空です。event.id:', event.id);
    return;
  }

  // plan_id は防御的に 'free' を設定する。
  // 通常は ef6.2 (createCheckoutSession) で先に subscription 行が { plan_id: 'free', status: 'active' } で作成済みのため
  // ここは UPDATE になるが、何らかの理由で行が存在しない場合の INSERT パスでも NOT NULL 制約 (plan_id) を満たすために含める。
  // 本来の plan_id は直後に到達する customer.subscription.created/updated で正しい値に上書きされる。
  const { error: upsertError } = await supabase
    .from('subscription')
    .upsert(
      {
        user_id: userId,
        plan_id: 'free',
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        status: 'active',
      },
      { onConflict: 'user_id' }
    );

  if (upsertError) {
    throw new Error(`[handleCheckoutSessionCompleted] DB error: subscription upsert 失敗: ${upsertError.message}`);
  }
}

/**
 * customer.subscription.created
 * 新規契約。plan_id / status / current_period_end などを subscription テーブルに反映する。
 */
export async function handleSubscriptionCreated(
  event: Stripe.Event,
  supabase: SupabaseClient
): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  await applySubscriptionState(supabase, subscription);
}

/**
 * customer.subscription.updated
 * プラン変更 / cancel_at_period_end の反映。current_period_end を更新する。
 */
export async function handleSubscriptionUpdated(
  event: Stripe.Event,
  supabase: SupabaseClient
): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  await applySubscriptionState(supabase, subscription);
}

/**
 * customer.subscription.deleted
 * 期間終了 or リトライ失敗 → Free に降格。
 * downgraded_at = now(), stripe_subscription_id = null, plan_id = 'free'。
 */
export async function handleSubscriptionDeleted(
  event: Stripe.Event,
  supabase: SupabaseClient
): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;

  const customerId = extractCustomerId(subscription.customer);
  if (!customerId) {
    console.warn('[handleSubscriptionDeleted] subscription.customer が空です。subscription.id:', subscription.id);
    return;
  }

  // plan_id は 'free' で固定。
  // 'free' は supabase/seed.sql で plan テーブルに INSERT 済みの固定 ID で、
  // billing-design.md §1 のプラン定義表でも公式に固定値として規定されている。
  // 状態遷移は billing-design.md §2 で「subscription.deleted → [Free active]」と定義されている。
  const { error: updateError, count } = await supabase
    .from('subscription')
    .update(
      {
        plan_id: 'free',
        stripe_subscription_id: null,
        status: 'active',
        cancel_at_period_end: false,
        current_period_end: null,
        downgraded_at: new Date().toISOString(),
      },
      { count: 'exact' }
    )
    .eq('stripe_customer_id', customerId);

  if (updateError) {
    throw new Error(`[handleSubscriptionDeleted] DB error: subscription UPDATE 失敗: ${updateError.message}`);
  }

  if (count === 0) {
    console.warn('[handleSubscriptionDeleted] stripe_customer_id に対応する subscription 行が見つかりません。customerId:', customerId);
  }
}

/**
 * invoice.payment_failed
 * status='past_due' に更新する。
 * subscription に紐付かない請求 (invoice.parent が null / subscription_details なし) は対象外。
 */
export async function handleInvoicePaymentFailed(
  event: Stripe.Event,
  supabase: SupabaseClient
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;

  // subscription に紐付かない請求は対象外
  const subscriptionDetails = invoice.parent?.subscription_details;
  if (!subscriptionDetails) {
    console.info('[handleInvoicePaymentFailed] subscription に紐付かない請求のため処理をスキップします。invoice.id:', invoice.id);
    return;
  }

  const customerId = extractCustomerId(invoice.customer);
  if (!customerId) {
    console.warn('[handleInvoicePaymentFailed] invoice.customer が空です。invoice.id:', invoice.id);
    return;
  }

  await updateStatusByCustomer(supabase, customerId, 'past_due');
}

/**
 * invoice.payment_succeeded
 * status='active' に戻す (past_due からの復帰)。
 * subscription に紐付かない請求は対象外。
 */
export async function handleInvoicePaymentSucceeded(
  event: Stripe.Event,
  supabase: SupabaseClient
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;

  // subscription に紐付かない請求は対象外
  const subscriptionDetails = invoice.parent?.subscription_details;
  if (!subscriptionDetails) {
    console.info('[handleInvoicePaymentSucceeded] subscription に紐付かない請求のため処理をスキップします。invoice.id:', invoice.id);
    return;
  }

  const customerId = extractCustomerId(invoice.customer);
  if (!customerId) {
    console.warn('[handleInvoicePaymentSucceeded] invoice.customer が空です。invoice.id:', invoice.id);
    return;
  }

  await updateStatusByCustomer(supabase, customerId, 'active');
}
