/**
 * プライバシーポリシーページのテスト
 *
 * テスト観点:
 * - h1 タイトルの表示
 * - 草案バナー (draft 表記) の表示
 * - 取得情報セクション (アカウント/コンテンツ/決済/利用) の見出し存在
 * - 第三者提供セクション (Supabase / Stripe / Vercel / Google 言及)
 * - GDPR セクションの存在
 * - お問い合わせ先 support@example.com の表示
 */

import { render, screen } from '@testing-library/react';
import PrivacyPage from '../page';

describe('プライバシーポリシーページ', () => {
  // ---------------------------------------------------------------------------
  // ページタイトル・基本情報
  // ---------------------------------------------------------------------------
  describe('ページタイトル・基本情報', () => {
    it('「プライバシーポリシー」が h1 で表示されること', () => {
      render(<PrivacyPage />);

      expect(
        screen.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })
      ).toBeInTheDocument();
    });

    it('草案バナー (Draft) が表示されること', () => {
      render(<PrivacyPage />);

      expect(screen.getByText(/草案.*Draft|Draft.*草案/i)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 取得する情報セクション
  // ---------------------------------------------------------------------------
  describe('取得する情報セクション', () => {
    it('「アカウント情報」の記述があること', () => {
      render(<PrivacyPage />);

      expect(screen.getByText(/アカウント情報/)).toBeInTheDocument();
    });

    it('「コンテンツ情報」の記述があること', () => {
      render(<PrivacyPage />);

      expect(screen.getAllByText(/コンテンツ情報/)[0]).toBeInTheDocument();
    });

    it('「決済情報」の記述があること', () => {
      render(<PrivacyPage />);

      expect(screen.getByText(/決済情報/)).toBeInTheDocument();
    });

    it('「利用情報」の記述があること', () => {
      render(<PrivacyPage />);

      expect(screen.getAllByText(/利用情報/)[0]).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 第三者提供セクション
  // ---------------------------------------------------------------------------
  describe('第三者提供セクション', () => {
    it('「第三者提供」セクションの見出しが存在すること', () => {
      render(<PrivacyPage />);

      expect(screen.getByRole('heading', { name: /第三者提供/ })).toBeInTheDocument();
    });

    it('Supabase への言及があること', () => {
      render(<PrivacyPage />);

      expect(screen.getByText(/Supabase/)).toBeInTheDocument();
    });

    it('Stripe への言及があること', () => {
      render(<PrivacyPage />);

      // 複数箇所での言及があるため getAllByText を使用
      expect(screen.getAllByText(/Stripe/)[0]).toBeInTheDocument();
    });

    it('Vercel への言及があること', () => {
      render(<PrivacyPage />);

      expect(screen.getByText(/Vercel/)).toBeInTheDocument();
    });

    it('Google への言及があること', () => {
      render(<PrivacyPage />);

      expect(screen.getAllByText(/Google/)[0]).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // GDPR セクション
  // ---------------------------------------------------------------------------
  describe('GDPR セクション', () => {
    it('GDPR セクションの見出しが存在すること', () => {
      render(<PrivacyPage />);

      expect(screen.getByRole('heading', { name: /GDPR/ })).toBeInTheDocument();
    });

    it('GDPR 関連の権利（削除権など）の記述があること', () => {
      render(<PrivacyPage />);

      expect(screen.getByText(/削除権/)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // お問い合わせ先
  // ---------------------------------------------------------------------------
  describe('お問い合わせ先', () => {
    it('お問い合わせ先 support@example.com が表示されること', () => {
      render(<PrivacyPage />);

      expect(screen.getByText('support@example.com')).toBeInTheDocument();
    });

    it('support@example.com が mailto リンクであること', () => {
      render(<PrivacyPage />);

      const link = screen.getByRole('link', { name: 'support@example.com' });
      expect(link).toHaveAttribute('href', 'mailto:support@example.com');
    });
  });
});
