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
 * 4. Stripe Subscription がある場合はキャンセル（TODO: Stripe 連携実装後に追加）
 * 5. Storage の photos/{userId}/ を削除（TODO: Storage 実装後に追加）
 * 6. Service Role で auth.admin.deleteUser(id) を実行（CASCADE で関連データ全削除）
 * 7. /login へリダイレクト
 *
 * 注意: Service Role キーを使用するため、このファイルはサーバーサイド専用。
 */
import { redirect } from 'next/navigation';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
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

  // TODO: Stripe Subscription がある場合はキャンセル
  // Stripe 連携実装後に以下の処理を追加:
  // const subscription = await getActiveSubscription(user.id);
  // if (subscription?.stripeSubscriptionId) {
  //   await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
  // }

  // TODO: Storage の photos/{userId}/ を一括削除
  // Storage 実装後に以下の処理を追加:
  // const adminClient = createServiceRoleClient();
  // await adminClient.storage.from('photos').remove([`${user.id}/`]);

  // Service Role で auth.admin.deleteUser を実行
  // CASCADE により profile / subscription / tree / person / relation / photo 等が全削除される
  const adminClient = createServiceRoleClient();
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteError) {
    console.error('[deleteAccount] deleteUser error:', deleteError.message);
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
