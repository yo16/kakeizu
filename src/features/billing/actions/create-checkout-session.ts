'use server';

/**
 * createCheckoutSession Server Action
 *
 * Stripe Checkout セッションを作成し、リダイレクト URL を返す。
 * billing-design.md §3 の仕様に準拠。
 *
 * 処理フロー:
 * 1. ユーザー認証チェック
 * 2. 入力バリデーション (zod)
 * 3. stripe_customer_id がなければ Stripe Customer 作成 → subscription テーブルに保存
 * 4. Stripe Checkout Session 作成 (idempotencyKey に ULID を使用)
 * 5. { ok: true, data: { url } } を返す
 */
import { headers } from 'next/headers';
import { ulid } from 'ulid';

import { getServerSession } from '@/lib/auth/session';
import { getStripe } from '@/lib/stripe/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { createCheckoutSessionSchema } from '../schemas';

/**
 * リクエストの origin を取得する。
 * Next.js の headers() から host / x-forwarded-proto を組み立て、
 * fallback として NEXT_PUBLIC_SITE_URL を使用する。
 */
async function getOrigin(): Promise<string> {
  const fallback = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  try {
    const headersList = await headers();
    const host = headersList.get('host');
    const proto =
      headersList.get('x-forwarded-proto') ??
      (process.env.NODE_ENV === 'production' ? 'https' : 'http');

    if (host) {
      return `${proto}://${host}`;
    }
  } catch {
    // headers() が利用できない環境 (e.g. テスト) では fallback を使う
  }

  return fallback;
}

export async function createCheckoutSession(
  input: unknown
): Promise<ActionResult<{ url: string }>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = createCheckoutSessionSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: firstError?.message ?? '入力値が不正です',
        field: firstError?.path[0]?.toString(),
      },
    };
  }

  const { priceId } = parsed.data;
  const userId = session.user.id;
  const userEmail = session.user.email;

  // Stripe SDK 初期化
  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch (err) {
    console.error('[createCheckoutSession] Stripe 初期化エラー:', err);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Stripe の設定が不正です。管理者に連絡してください',
      },
    };
  }

  const supabase = await createClient();

  // subscription レコードを取得 (stripe_customer_id を確認するため)
  const { data: subscription, error: fetchError } = await supabase
    .from('subscription')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('[createCheckoutSession] subscription 取得エラー:', fetchError);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'サブスクリプション情報の取得に失敗しました',
      },
    };
  }

  // stripe_customer_id を確保する (なければ作成して DB に保存)
  let stripeCustomerId: string | null =
    subscription?.stripe_customer_id ?? null;

  if (!stripeCustomerId) {
    // Stripe Customer 作成
    let stripeCustomer: { id: string };
    try {
      stripeCustomer = await stripe.customers.create({
        metadata: { user_id: userId },
        ...(userEmail ? { email: userEmail } : {}),
      });
    } catch (err) {
      console.error('[createCheckoutSession] Stripe Customer 作成エラー:', err);
      return {
        ok: false,
        error: {
          code: 'STRIPE_ERROR',
          message: 'Stripe カスタマーの作成に失敗しました',
        },
      };
    }

    stripeCustomerId = stripeCustomer.id;

    // subscription テーブルに upsert (行がない場合は free プランで作成)
    // INSERT/UPDATE は RLS で禁止されているため Service Role クライアントを使用する
    // (subscription の RLS は SELECT のみ user に許可、書き込みは Service Role のみ)
    const adminSupabase = createServiceRoleClient();
    const { error: upsertError } = await adminSupabase
      .from('subscription')
      .upsert(
        {
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          plan_id: 'free',
          status: 'active',
        },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      console.error('[createCheckoutSession] subscription upsert エラー:', upsertError);
      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'サブスクリプション情報の保存に失敗しました',
        },
      };
    }
  }

  // origin を取得
  const origin = await getOrigin();

  // Stripe Checkout Session 作成
  // idempotencyKey に ULID を使用して二重作成を防ぐ
  const idempotencyKey = ulid();

  let checkoutSession: { url: string | null };
  try {
    checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        customer: stripeCustomerId,
        success_url: `${origin}/account/billing?status=success`,
        cancel_url: `${origin}/pricing?status=canceled`,
        client_reference_id: userId,
        subscription_data: {
          metadata: { user_id: userId },
        },
      },
      {
        idempotencyKey,
      }
    );
  } catch (err) {
    console.error('[createCheckoutSession] Checkout Session 作成エラー:', err);
    return {
      ok: false,
      error: {
        code: 'STRIPE_ERROR',
        message: 'Checkout セッションの作成に失敗しました',
      },
    };
  }

  if (!checkoutSession.url) {
    console.error('[createCheckoutSession] Checkout Session に URL がありません');
    return {
      ok: false,
      error: {
        code: 'STRIPE_ERROR',
        message: 'Checkout URL の取得に失敗しました',
      },
    };
  }

  return { ok: true, data: { url: checkoutSession.url } };
}
