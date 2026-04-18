'use server';

/**
 * requestPasswordReset Server Action
 *
 * パスワードリセットメールを送信する。
 * セキュリティ上、メールが未登録の場合も成功レスポンスを返す（列挙攻撃防止）。
 */
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { requestPasswordResetSchema } from '../schemas';

export async function requestPasswordReset(
  input: unknown
): Promise<ActionResult<{ message: string }>> {
  const parsed = requestPasswordResetSchema.safeParse(input);
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

  const { email } = parsed.data;
  const supabase = await createClient();

  const redirectTo =
    process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
      : 'http://localhost:3000/auth/callback';

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    console.error('[requestPasswordReset] error:', error.message);
    // セキュリティ上、エラー詳細は返さず成功と同じメッセージを返す
  }

  return {
    ok: true,
    data: {
      message:
        'パスワードリセットの手順をメールで送信しました。メールが届かない場合は、入力したアドレスをご確認ください',
    },
  };
}
