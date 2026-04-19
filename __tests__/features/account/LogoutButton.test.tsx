/**
 * LogoutButton コンポーネントのテスト
 *
 * テスト観点:
 * - ボタンが存在する
 * - クリックで signOut Server Action が呼ばれる
 * - 呼び出し中は loading 状態（再クリックしても呼ばれない）
 * - エラー時に toast.error が呼ばれる
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogoutButton } from '@/features/account/components/LogoutButton';

// Server Action をモック化
jest.mock('@/features/auth/actions/sign-out', () => ({
  signOut: jest.fn(),
}));

// useToast をモック化
const mockToastError = jest.fn();
jest.mock('@/components/ui/Toast/ToastProvider', () => ({
  useToast: () => ({
    show: jest.fn(),
    success: jest.fn(),
    error: mockToastError,
    warning: jest.fn(),
    info: jest.fn(),
    dismiss: jest.fn(),
  }),
}));

import { signOut } from '@/features/auth/actions/sign-out';
const mockSignOut = signOut as jest.MockedFunction<typeof signOut>;

describe('LogoutButton', () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockToastError.mockReset();
  });

  describe('表示確認', () => {
    it('ログアウトボタンが存在する', () => {
      render(<LogoutButton />);
      expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument();
    });
  });

  describe('クリック動作', () => {
    it('クリックで signOut が呼ばれる', async () => {
      // signOut は resolve して戻らない（リダイレクトするため）想定だが
      // テストでは resolve を返す
      mockSignOut.mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<LogoutButton />);
      await user.click(screen.getByRole('button', { name: 'ログアウト' }));
      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      });
    });

    it('loading 中は再クリックしても signOut が追加で呼ばれない', async () => {
      // signOut を永続的に pending にする
      let resolveSignOut!: () => void;
      mockSignOut.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSignOut = resolve;
          })
      );

      const user = userEvent.setup();
      render(<LogoutButton />);
      const button = screen.getByRole('button', { name: 'ログアウト' });

      // 1回目クリック（loading 開始）
      await user.click(button);
      expect(mockSignOut).toHaveBeenCalledTimes(1);

      // loading 中に再クリック
      await user.click(button);
      expect(mockSignOut).toHaveBeenCalledTimes(1);

      // クリーンアップ
      resolveSignOut();
    });
  });

  describe('エラーハンドリング', () => {
    it('signOut がエラーをスローしたとき toast.error が呼ばれる', async () => {
      mockSignOut.mockRejectedValue(new Error('network error'));
      const user = userEvent.setup();
      render(<LogoutButton />);
      await user.click(screen.getByRole('button', { name: 'ログアウト' }));
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          'ログアウトに失敗しました。もう一度お試しください。'
        );
      });
    });
  });
});
