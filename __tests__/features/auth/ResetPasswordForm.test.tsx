/**
 * ResetPasswordForm コンポーネントのテスト
 *
 * テスト観点:
 * - password / passwordConfirm の入力欄が存在する
 * - パスワード不一致でエラーが表示される
 * - 7文字（8文字未満）のパスワードでエラーが表示される
 * - 正常送信で supabase.auth.updateUser({ password }) が呼ばれる
 * - 成功時に router.push('/login?reset=success') が呼ばれる
 * - 失敗時にエラーメッセージが表示される
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm';

// next/navigation の useRouter をモック化
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Supabase Client をモック化
const mockUpdateUser = jest.fn();
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      updateUser: mockUpdateUser,
    },
  })),
}));

/**
 * name 属性でパスワード input を取得するヘルパー
 * FormLabel の required prop により label 内に aria-hidden の * が挿入されるため
 * getByLabelText での完全マッチが困難なケースで使用する。
 */
function getPasswordInput(): HTMLElement {
  // eslint-disable-next-line testing-library/no-node-access
  return document.querySelector('input[name="password"]') as HTMLElement;
}

function getPasswordConfirmInput(): HTMLElement {
  // eslint-disable-next-line testing-library/no-node-access
  return document.querySelector('input[name="passwordConfirm"]') as HTMLElement;
}

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    mockUpdateUser.mockReset();
    mockPush.mockReset();
  });

  describe('フィールドの存在確認', () => {
    it('新しいパスワードの入力欄が存在する', () => {
      render(<ResetPasswordForm />);
      expect(getPasswordInput()).toBeInTheDocument();
    });

    it('新しいパスワード（確認）の入力欄が存在する', () => {
      render(<ResetPasswordForm />);
      expect(getPasswordConfirmInput()).toBeInTheDocument();
    });

    it('送信ボタンが存在する', () => {
      render(<ResetPasswordForm />);
      expect(screen.getByRole('button', { name: /パスワードを更新する/ })).toBeInTheDocument();
    });
  });

  describe('バリデーション', () => {
    it('パスワードと確認用パスワードが不一致のときエラーが表示される', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm />);
      await user.type(getPasswordInput(), 'password123');
      await user.type(getPasswordConfirmInput(), 'different123');
      await user.click(screen.getByRole('button', { name: /パスワードを更新する/ }));
      await waitFor(() => {
        const messages = screen.getAllByText('パスワードが一致しません');
        expect(messages.length).toBeGreaterThan(0);
      });
    });

    it('不一致時は updateUser が呼ばれない', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm />);
      await user.type(getPasswordInput(), 'password123');
      await user.type(getPasswordConfirmInput(), 'different123');
      await user.click(screen.getByRole('button', { name: /パスワードを更新する/ }));
      await waitFor(() => {
        const messages = screen.getAllByText('パスワードが一致しません');
        expect(messages.length).toBeGreaterThan(0);
      });
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('7文字（8文字未満）のパスワードでエラーが表示される', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm />);
      await user.type(getPasswordInput(), 'abcd123');
      await user.type(getPasswordConfirmInput(), 'abcd123');
      await user.click(screen.getByRole('button', { name: /パスワードを更新する/ }));
      await waitFor(() => {
        const messages = screen.getAllByText('パスワードは8文字以上で入力してください');
        expect(messages.length).toBeGreaterThan(0);
      });
    });
  });

  describe('正常送信', () => {
    it('正常入力で supabase.auth.updateUser が { password } で呼ばれる', async () => {
      mockUpdateUser.mockResolvedValue({ data: {}, error: null });
      const user = userEvent.setup();
      render(<ResetPasswordForm />);
      await user.type(getPasswordInput(), 'newpassword123');
      await user.type(getPasswordConfirmInput(), 'newpassword123');
      await user.click(screen.getByRole('button', { name: /パスワードを更新する/ }));
      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword123' });
      });
    });

    it('成功時に router.push が /login?reset=success で呼ばれる', async () => {
      mockUpdateUser.mockResolvedValue({ data: {}, error: null });
      const user = userEvent.setup();
      render(<ResetPasswordForm />);
      await user.type(getPasswordInput(), 'newpassword123');
      await user.type(getPasswordConfirmInput(), 'newpassword123');
      await user.click(screen.getByRole('button', { name: /パスワードを更新する/ }));
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login?reset=success');
      });
    });
  });

  describe('Supabase エラーハンドリング', () => {
    it('updateUser がエラーを返したとき画面にエラーメッセージが表示される', async () => {
      mockUpdateUser.mockResolvedValue({
        data: {},
        error: { message: 'Token has expired' },
      });
      const user = userEvent.setup();
      render(<ResetPasswordForm />);
      await user.type(getPasswordInput(), 'newpassword123');
      await user.type(getPasswordConfirmInput(), 'newpassword123');
      await user.click(screen.getByRole('button', { name: /パスワードを更新する/ }));
      await waitFor(() => {
        expect(
          screen.getByText(/パスワードの更新に失敗しました/)
        ).toBeInTheDocument();
      });
    });

    it('エラー時に router.push が呼ばれない', async () => {
      mockUpdateUser.mockResolvedValue({
        data: {},
        error: { message: 'Token has expired' },
      });
      const user = userEvent.setup();
      render(<ResetPasswordForm />);
      await user.type(getPasswordInput(), 'newpassword123');
      await user.type(getPasswordConfirmInput(), 'newpassword123');
      await user.click(screen.getByRole('button', { name: /パスワードを更新する/ }));
      await waitFor(() => {
        expect(screen.getByText(/パスワードの更新に失敗しました/)).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
