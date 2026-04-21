/**
 * GoogleSignInButton コンポーネントのテスト
 *
 * テスト観点:
 * - ボタンが存在する
 * - クリックで supabase.auth.signInWithOAuth が { provider: 'google', options: { redirectTo } } で呼ばれる
 * - エラー時に toast.error が呼ばれる
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/ui/Toast/ToastProvider';
import { GoogleSignInButton } from '@/features/auth/components/GoogleSignInButton';

// Supabase Client をモック化
const mockSignInWithOAuth = jest.fn();
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
    },
  })),
}));

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    mockSignInWithOAuth.mockReset();
  });

  describe('基本レンダリング', () => {
    it('Google サインインボタンが存在する', () => {
      renderWithToast(<GoogleSignInButton />);
      expect(screen.getByRole('button', { name: /Google/ })).toBeInTheDocument();
    });
  });

  describe('クリック動作', () => {
    it('クリックで signInWithOAuth が provider: "google" で呼ばれる', async () => {
      mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
      const user = userEvent.setup();
      renderWithToast(<GoogleSignInButton />);
      await user.click(screen.getByRole('button', { name: /Google/ }));
      await waitFor(() => {
        expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1);
        expect(mockSignInWithOAuth).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: 'google',
          })
        );
      });
    });

    it('クリックで signInWithOAuth の options.redirectTo に /auth/callback が含まれる', async () => {
      mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
      const user = userEvent.setup();
      renderWithToast(<GoogleSignInButton />);
      await user.click(screen.getByRole('button', { name: /Google/ }));
      await waitFor(() => {
        expect(mockSignInWithOAuth).toHaveBeenCalledWith(
          expect.objectContaining({
            options: expect.objectContaining({
              redirectTo: expect.stringContaining('/auth/callback'),
            }),
          })
        );
      });
    });

    it('エラー時に toast.error が呼ばれる（role="alert" が画面に表示される）', async () => {
      mockSignInWithOAuth.mockResolvedValue({
        data: null,
        error: { message: 'OAuth エラーが発生しました' },
      });
      const user = userEvent.setup();
      renderWithToast(<GoogleSignInButton />);
      await user.click(screen.getByRole('button', { name: /Google/ }));
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent('OAuth エラーが発生しました');
      });
    });
  });
});
