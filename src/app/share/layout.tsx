/**
 * share ルートのレイアウト
 *
 * 未認証アクセス可能な公開閲覧ページ用レイアウト。
 * (main) グループ外に配置し、認証チェックを行わない。
 * ヘッダー等の認証済みユーザー向けナビゲーションを含まないシンプルな構成。
 *
 * 現状は pass-through だが、将来的に共通フッターやサービス紹介リンク等を
 * 追加する余地を残すためレイアウトとして定義しておく。
 */
import type { ReactNode } from 'react';

interface ShareLayoutProps {
  children: ReactNode;
}

export default function ShareLayout({ children }: ShareLayoutProps) {
  return <>{children}</>;
}
