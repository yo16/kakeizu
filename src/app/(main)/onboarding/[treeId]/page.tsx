/**
 * オンボーディングページ
 *
 * 新規ツリー作成直後に表示するウィザード。
 * treeId を URL パラメータで受け取る。
 *
 * - 認証: (main) レイアウトが保証する
 * - localStorage の完了フラグ確認: OnboardingPageClient (Client Component) が担当
 * - 完了済みの場合: /trees/[treeId] へリダイレクト（クライアント側で実行）
 */

import { OnboardingPageClient } from '@/features/onboarding/components/OnboardingPageClient';
import styles from './page.module.css';

interface OnboardingPageProps {
  params: Promise<{ treeId: string }>;
}

export default async function OnboardingPage({ params }: OnboardingPageProps) {
  const { treeId } = await params;

  return (
    <main className={styles.main}>
      <OnboardingPageClient treeId={treeId} />
    </main>
  );
}
