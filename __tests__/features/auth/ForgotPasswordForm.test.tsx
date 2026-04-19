/**
 * ForgotPasswordForm コンポーネントのテスト
 *
 * テスト観点:
 * - email 入力欄がラベル付きで存在する
 * - 空送信でバリデーションエラーが表示される
 * - 無効なメールアドレスでバリデーションエラーが表示される
 * - 正常送信で requestPasswordReset が { email } で呼ばれる
 * - 成功時に成功メッセージと送信先メールアドレスが表示される
 * - 失敗時にエラーメッセージが表示される
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm';

// Server Action をモック化
jest.mock('@/features/auth/actions/request-password-reset', () => ({
  requestPasswordReset: jest.fn(),
}));

import { requestPasswordReset } from '@/features/auth/actions/request-password-reset';
const mockRequestPasswordReset = requestPasswordReset as jest.MockedFunction<
  typeof requestPasswordReset
>;

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    mockRequestPasswordReset.mockReset();
  });

  describe('フィールドの存在確認', () => {
    it('メールアドレスの入力欄がラベル付きで存在する', () => {
      render(<ForgotPasswordForm />);
      expect(screen.getByLabelText(/メールアドレス/)).toBeInTheDocument();
    });

    it('送信ボタンが存在する', () => {
      render(<ForgotPasswordForm />);
      expect(screen.getByRole('button', { name: /リセット用メールを送信/ })).toBeInTheDocument();
    });
  });

  describe('バリデーション', () => {
    it('空送信でメールアドレスのバリデーションエラーが表示される', async () => {
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);
      await user.click(screen.getByRole('button', { name: /リセット用メールを送信/ }));
      await waitFor(() => {
        const messages = screen.getAllByText('有効なメールアドレスを入力してください');
        expect(messages.length).toBeGreaterThan(0);
      });
    });

    it('空送信時は requestPasswordReset が呼ばれない', async () => {
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);
      await user.click(screen.getByRole('button', { name: /リセット用メールを送信/ }));
      await waitFor(() => {
        const messages = screen.getAllByText('有効なメールアドレスを入力してください');
        expect(messages.length).toBeGreaterThan(0);
      });
      expect(mockRequestPasswordReset).not.toHaveBeenCalled();
    });

    it('無効なメールアドレスでバリデーションエラーが表示される', async () => {
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'invalid-email');
      await user.click(screen.getByRole('button', { name: /リセット用メールを送信/ }));
      await waitFor(() => {
        const messages = screen.getAllByText('有効なメールアドレスを入力してください');
        expect(messages.length).toBeGreaterThan(0);
      });
    });
  });

  describe('正常送信', () => {
    it('正常入力で requestPasswordReset が { email } で呼ばれる', async () => {
      mockRequestPasswordReset.mockResolvedValue({
        ok: true,
        data: { message: 'パスワードリセットの手順をメールで送信しました。' },
      } as never);
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /リセット用メールを送信/ }));
      await waitFor(() => {
        expect(mockRequestPasswordReset).toHaveBeenCalledWith({
          email: 'test@example.com',
        });
      });
    });

    it('成功時に送信先メールアドレスを含む成功メッセージが表示される', async () => {
      mockRequestPasswordReset.mockResolvedValue({
        ok: true,
        data: { message: 'パスワードリセットの手順をメールで送信しました。' },
      } as never);
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /リセット用メールを送信/ }));
      await waitFor(() => {
        expect(screen.getByText(/test@example\.com/)).toBeInTheDocument();
      });
      // フォームが非表示になっていることを確認
      expect(
        screen.queryByRole('button', { name: /リセット用メールを送信/ })
      ).not.toBeInTheDocument();
    });
  });

  describe('Server Action エラーハンドリング', () => {
    it('失敗時にエラーメッセージが画面に表示される', async () => {
      mockRequestPasswordReset.mockResolvedValue({
        ok: false,
        error: { message: 'サーバーエラーが発生しました' },
      } as never);
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /リセット用メールを送信/ }));
      await waitFor(() => {
        expect(screen.getByText('サーバーエラーが発生しました')).toBeInTheDocument();
      });
    });
  });
});
