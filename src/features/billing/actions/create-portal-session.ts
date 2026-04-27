'use server';

/**
 * createPortalSession Server Action
 *
 * Stripe Customer Portal セッションを作成し、リダイレクト URL を返す。
 * billing-design.md §3 Customer Portal の仕様に準拠。
 *
 * 処理フロー:
 * 1. ユーザー認証チェック
 * 2. subscription テーブルから stripe_customer_id を取得 (RLS で本人のみ)
 * 3. stripe_customer_id が NULL の場合は NOT_FOUND を返す
 * 4. Stripe SDK 初期化
 * 5. Stripe Customer Portal Session を作成
 * 6. { ok: true, data: { url } } を返す
 */

import { getServerSession } from '@/lib/auth/session';
import { getStripe } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { getOrigin } from '../lib/get-origin';

export async function createPortalSession(): Promise<ActionResult<{ url: string }>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  const userId = session.user.id;

  // subscription テーブルから stripe_customer_id を取得 (RLS で本人のみ SELECT 可)
  const supabase = await createClient();
  const { data: subscription, error: fetchError } = await supabase
    .from('subscription')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('[createPortalSession] subscription 取得エラー:', fetchError);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'サブスクリプション情報の取得に失敗しました',
      },
    };
  }

  // stripe_customer_id が未設定 (Checkout 未経験の Free プランユーザー)
  const stripeCustomerId = subscription?.stripe_customer_id ?? null;
  if (!stripeCustomerId) {
    return {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: '課金情報が見つかりません。先にプランを購入してください',
      },
    };
  }

  // Stripe SDK 初期化
  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch (err) {
    console.error('[createPortalSession] Stripe 初期化エラー:', err);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Stripe の設定が不正です。管理者に連絡してください',
      },
    };
  }

  // origin を取得して return_url を組み立てる
  const origin = await getOrigin();
  const returnUrl = `${origin}/account/billing`;

  // Stripe Customer Portal Session 作成
  // Stripe SDK の Session.url 型は string (null 非許容) だが、
  // フェールセーフとして空文字チェックは残す
  let portalUrl: string;
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });
    portalUrl = portalSession.url;
  } catch (err) {
    console.error('[createPortalSession] Customer Portal Session 作成エラー:', err);
    return {
      ok: false,
      error: {
        code: 'STRIPE_ERROR',
        message: 'Customer Portal セッションの作成に失敗しました',
      },
    };
  }

  if (!portalUrl) {
    console.error('[createPortalSession] Customer Portal Session に URL がありません');
    return {
      ok: false,
      error: {
        code: 'STRIPE_ERROR',
        message: 'Customer Portal URL の取得に失敗しました',
      },
    };
  }

  return { ok: true, data: { url: portalUrl } };
}
