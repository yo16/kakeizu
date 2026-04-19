/**
 * EmailVerificationNotice コンポーネントのテスト
 *
 * テスト観点:
 * - email prop が画面に表示される
 * - /login へのリンクが存在する
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { EmailVerificationNotice } from '@/features/auth/components/EmailVerificationNotice';

describe('EmailVerificationNotice', () => {
  it('email prop が画面に表示される', () => {
    render(<EmailVerificationNotice email="test@example.com" />);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('/login へのリンクが存在する', () => {
    render(<EmailVerificationNotice email="test@example.com" />);
    const link = screen.getByRole('link', { name: /ログイン/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/login');
  });

  it('確認メール送信のタイトルが表示される', () => {
    render(<EmailVerificationNotice email="test@example.com" />);
    expect(screen.getByText('確認メールを送信しました')).toBeInTheDocument();
  });
});
