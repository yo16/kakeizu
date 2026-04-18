'use server';

/**
 * signInWithPassword Server Action
 *
 * メール+パスワードでサインインする。
 * 成功時: onboarding_state に応じて /onboarding または /dashboard へリダイレクト。
 * 失敗時: エラーオブジェクトを返す（フォーム再表示用）。
 */
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { signInSchema } from '../schemas';

export async function signInWithPassword(
  input: unknown
): Promise<ActionResult<void>> {
  const parsed = signInSchema.safeParse(input);
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

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('[signInWithPassword] error:', error.message);
    return {
      ok: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'メールアドレスまたはパスワードが正しくありません',
      },
    };
  }

  // onboarding_state を確認してリダイレクト先を決定
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: onboardingState } = await supabase
      .from('onboarding_state')
      .select('is_completed')
      .eq('user_id', user.id)
      .maybeSingle();

    const isOnboardingCompleted = onboardingState?.is_completed === true;

    if (!isOnboardingCompleted) {
      redirect('/onboarding');
    }
  }

  redirect('/dashboard');
}
