/**
 * (main) Route Group レイアウト
 *
 * 認証必須ページ群（/dashboard, /trees/**, /account/**, /onboarding）の
 * 共通レイアウト。二重防御の第2層として機能する。
 *
 * 第1層: src/middleware.ts（Edge Runtime）でリクエスト単位のリダイレクト
 * 第2層: このレイアウト（Server Component）で確実な認証確認
 */
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getServerSession } from '@/lib/auth/session';
import { ToastProvider } from '@/components/ui/Toast/ToastProvider';

interface MainLayoutProps {
  children: ReactNode;
}

export default async function MainLayout({ children }: MainLayoutProps) {
  const session = await getServerSession();

  if (!session) {
    // middleware をすり抜けた場合のフォールバック保護
    redirect('/login');
  }

  return <ToastProvider>{children}</ToastProvider>;
}
