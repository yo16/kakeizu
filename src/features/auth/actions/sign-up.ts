'use server';

/**
 * signUpWithPassword Server Action
 *
 * メール+パスワードでサインアップする。
 * Email confirmation が ON のため、確認メール送信で成功扱い。
 * 成功時: { ok: true, data: undefined } を返す（フォーム側でメッセージを表示する）。
 * 失敗時: エラーオブジェクトを返す。
 */
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { signUpSchema } from '../schemas';

export async function signUpWithPassword(
  input: unknown
): Promise<ActionResult<{ message: string }>> {
  const parsed = signUpSchema.safeParse(input);
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

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    console.error('[signUpWithPassword] error:', error.message);

    // メールアドレスが既に登録済みの場合はユーザーフレンドリーなメッセージを返す
    if (error.message.toLowerCase().includes('user already registered')) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'このメールアドレスはすでに登録されています',
          field: 'email',
        },
      };
    }

    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'サインアップに失敗しました。しばらく経ってから再試行してください',
      },
    };
  }

  return {
    ok: true,
    data: {
      message:
        '確認メールを送信しました。メール内のリンクをクリックして登録を完了してください',
    },
  };
}
