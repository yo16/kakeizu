'use server';

/**
 * signOut Server Action
 *
 * 現在のセッションを破棄し、/login へリダイレクトする。
 */
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export async function signOut(): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('[signOut] error:', error.message);
    // サインアウト失敗時も /login にリダイレクトしてセッションをリセットさせる
  }

  redirect('/login');
}
