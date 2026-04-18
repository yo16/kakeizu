/**
 * OAuth コールバック Route Handler
 *
 * Google OAuth 等で認可コードを受け取り、セッションに変換する。
 * 成功後: オンボーディング未完了なら /onboarding、完了済みなら /dashboard へリダイレクト。
 * 失敗時: /login?error=auth_callback_failed へリダイレクト。
 */
import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const supabase = await createClient();

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error('[auth/callback] exchangeCodeForSession error:', exchangeError.message);
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('[auth/callback] getUser error:', userError?.message);
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  // onboarding_state を確認してリダイレクト先を決定
  const { data: onboardingState } = await supabase
    .from('onboarding_state')
    .select('is_completed')
    .eq('user_id', user.id)
    .maybeSingle();

  const isOnboardingCompleted = onboardingState?.is_completed === true;

  if (!isOnboardingCompleted) {
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
