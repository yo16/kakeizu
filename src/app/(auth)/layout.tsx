/**
 * (auth) Route Group レイアウト
 *
 * 認証ページ群（/login, /signup, /forgot-password）の共通レイアウト。
 * 既ログイン状態のユーザーを /dashboard へリダイレクトする。
 */
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AuthShell } from '@/components/layout/AuthShell';
import { ToastProvider } from '@/components/ui/Toast/ToastProvider';
import { getServerSession } from '@/lib/auth/session';

interface AuthLayoutProps {
  children: ReactNode;
}

export default async function AuthLayout({ children }: AuthLayoutProps) {
  const session = await getServerSession();

  if (session) {
    // 既ログイン状態のユーザーをダッシュボードへリダイレクト
    redirect('/dashboard');
  }

  return (
    <ToastProvider>
      <AuthShell>{children}</AuthShell>
    </ToastProvider>
  );
}
