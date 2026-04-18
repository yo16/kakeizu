/**
 * サーバーサイド セッション取得ヘルパー
 *
 * Server Component / Server Action から認証ユーザーを取得するためのヘルパー。
 * 認証失敗時は null を返す。呼び出し側で redirect('/login') を行うこと。
 *
 * 使用例:
 *   const session = await getServerSession();
 *   if (!session) redirect('/login');
 */
import type { Session, User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

export interface ServerSession {
  user: User;
  session: Session | null;
}

/**
 * サーバーサイドで認証セッションを取得する。
 *
 * @returns 認証済みの場合は { user, session }、未認証または失敗時は null
 */
export async function getServerSession(): Promise<ServerSession | null> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    return { user, session };
  } catch (error) {
    console.error('[getServerSession] unexpected error:', error);
    return null;
  }
}
