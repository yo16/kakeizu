/**
 * Stripe Webhook Route Handler
 *
 * POST /api/stripe/webhook
 *
 * 設計仕様: billing-design.md §4 / security-design.md §6
 *
 * 処理フロー:
 * 1. STRIPE_WEBHOOK_SECRET の存在チェック (未設定時 500)
 * 2. raw body を req.text() で取得
 * 3. stripe-signature ヘッダで署名検証 (失敗時 400)
 * 4. billing_event テーブルへ event.id を INSERT (冪等性)
 *    - UNIQUE 違反 (code: '23505') → 重複イベントとして 200 を返す
 * 5. routeWebhookEvent でハンドラへ振り分け
 *    - 業務ロジックエラー → 200 (Stripe 無限リトライ抑制)
 *    - 想定外エラー → 500 (Stripe 自動リトライ)
 */

// Edge Runtime 不可 (raw body 取得・Stripe 署名検証に Node.js が必要)
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { routeWebhookEvent } from '@/features/billing/webhook';
import { WebhookBusinessError } from '@/features/billing/webhook/errors';

/** Supabase の UNIQUE 制約違反エラーコード */
const PG_UNIQUE_VIOLATION = '23505';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // STRIPE_WEBHOOK_SECRET の存在チェック
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET が設定されていません');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  // raw body を取得 (req.json() ではなく req.text() を使うこと)
  const rawBody = await req.text();

  // stripe-signature ヘッダの取得
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    console.warn('[webhook] stripe-signature ヘッダがありません');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Stripe SDK 初期化 & 署名検証
  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch (err) {
    console.error('[webhook] Stripe SDK 初期化エラー:', err);
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event: import('stripe').default.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.warn('[webhook] 署名検証失敗:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Service Role クライアント (billing_event は RLS で全アクセス禁止のため必須)
  const supabase = createServiceRoleClient();

  // 冪等性チェック: billing_event テーブルへ event.id を INSERT
  const { error: insertError } = await supabase.from('billing_event').insert({
    stripe_event_id: event.id,
    type: event.type,
    payload: event,
  });

  if (insertError) {
    if (insertError.code === PG_UNIQUE_VIOLATION) {
      // 重複イベント: 再処理せずに 200 を返す
      console.info('[webhook] 重複イベントをスキップ:', event.id, event.type);
      return NextResponse.json({ received: true }, { status: 200 });
    }
    // INSERT 自体が想定外のエラー → Stripe に 500 を返してリトライさせる
    console.error('[webhook] billing_event INSERT エラー:', insertError);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // イベントルーターへ振り分け
  try {
    await routeWebhookEvent(event, supabase);
  } catch (err) {
    if (err instanceof WebhookBusinessError) {
      // 業務エラー (Stripe リトライ不要): 200 を返して無限リトライを抑制
      console.warn('[webhook] business error:', err.message);
      return NextResponse.json({ received: true }, { status: 200 });
    }
    // 想定外エラー → Stripe が自動リトライするよう 500 を返す
    console.error('[webhook] unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
