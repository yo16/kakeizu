/**
 * Stripe サーバーサイド SDK 初期化
 *
 * このファイルはサーバーサイド専用。クライアントへの誤バンドルを `server-only` で防止。
 * Stripe インスタンスは `getStripe()` 経由で取得すること。
 *
 * 環境変数 `STRIPE_SECRET_KEY` が未設定の場合は `getStripe()` 呼び出し時にエラーをスローする。
 */
import 'server-only';

import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

/**
 * Stripe SDK の共有インスタンスを返す。
 *
 * @throws `STRIPE_SECRET_KEY` が未設定の場合は Error をスロー
 */
export function getStripe(): Stripe {
  if (stripeInstance) {
    return stripeInstance;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      '[stripe/server] STRIPE_SECRET_KEY が設定されていません。環境変数を確認してください。'
    );
  }

  stripeInstance = new Stripe(secretKey);

  return stripeInstance;
}
