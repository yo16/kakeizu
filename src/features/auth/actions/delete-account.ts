'use server';

/**
 * deleteAccount Server Action
 *
 * 現在ログイン中のユーザーのアカウントを削除する。
 *
 * 処理手順:
 * 1. confirmEmail でメールアドレスを確認
 * 2. 現在のセッションから user を取得
 * 3. confirmEmail と実際のメールアドレスが一致するか検証
 * 4. Stripe Subscription がある場合はキャンセル（Stripe API 失敗時も DB 削除は続行）
 * 5. Storage の photos/{userId}/ を削除（TODO: Storage 実装後に追加）
 * 6. Service Role で auth.admin.deleteUser(id) を実行（CASCADE で関連データ全削除）
 * 7. /login へリダイレクト
 *
 * 注意: Service Role キーを使用するため、このファイルはサーバーサイド専用。
 */
import { redirect } from 'next/navigation';

import { logger } from '@/lib/logger';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { type ActionResult } from '@/types/action';

import { deleteAccountSchema } from '../schemas';

export async function deleteAccount(
  input: unknown
): Promise<ActionResult<void>> {
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: firstError.message,
        field: firstError.path[0]?.toString(),
      },
    };
  }

  const { confirmEmail } = parsed.data;

  // 現在のセッションからユーザーを取得
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'セッションが無効です。再度ログインしてください',
      },
    };
  }

  // 確認用メールアドレスの一致チェック
  if (user.email !== confirmEmail) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'メールアドレスが一致しません',
        field: 'confirmEmail',
      },
    };
  }

  // Stripe Subscription がある場合はキャンセル
  // Stripe API 失敗時もユーザー体験を優先し DB 削除を続行する
  const { data: subscriptionRow, error: subFetchError } = await supabase
    .from('subscription')
    .select('stripe_subscription_id, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (subFetchError) {
    logger.error('[deleteAccount] subscription fetch error:', subFetchError.message);
  }

  const stripeSubId = subscriptionRow?.stripe_subscription_id;
  const subStatus = subscriptionRow?.status;

  if (stripeSubId && subStatus !== 'canceled') {
    try {
      const stripe = getStripe();
      await stripe.subscriptions.cancel(stripeSubId, {
        invoice_now: false,
        prorate: false,
      });
      logger.info('[deleteAccount] Stripe subscription canceled:', stripeSubId);
    } catch (stripeError) {
      logger.error(
        '[deleteAccount] Stripe subscription cancel failed (continuing with account deletion):',
        stripeError
      );
    }
  }

  // TODO: Storage の photos/{userId}/ を一括削除
  // Storage 実装後に以下の処理を追加:
  // const adminClient = createServiceRoleClient();
  // await adminClient.storage.from('photos').remove([`${user.id}/`]);

  // Service Role で auth.admin.deleteUser を実行
  // CASCADE により profile / subscription / tree / person / relation / photo 等が全削除される
  const adminClient = createServiceRoleClient();
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteError) {
    logger.error('[deleteAccount] deleteUser error:', deleteError.message);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'アカウントの削除に失敗しました。しばらく経ってから再試行してください',
      },
    };
  }

  redirect('/login');
}
