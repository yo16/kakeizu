/**
 * AuthShell コンポーネントのテスト
 *
 * テスト観点:
 * - role="main" を持つ main 要素が存在すること
 * - children が描画されること
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { AuthShell } from '@/components/layout/AuthShell';

describe('AuthShell', () => {
  describe('基本レンダリング', () => {
    it('role="main" を持つ main 要素が存在すること', () => {
      render(<AuthShell>ログインフォーム</AuthShell>);
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('children が描画されること', () => {
      render(
        <AuthShell>
          <span data-testid="auth-child">認証コンテンツ</span>
        </AuthShell>
      );
      expect(screen.getByTestId('auth-child')).toBeInTheDocument();
    });

    it('複数の children が描画されること', () => {
      render(
        <AuthShell>
          <h1>ログイン</h1>
          <p>メールアドレスを入力してください</p>
        </AuthShell>
      );
      expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument();
      expect(screen.getByText('メールアドレスを入力してください')).toBeInTheDocument();
    });
  });
});
