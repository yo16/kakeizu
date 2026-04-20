/**
 * DeleteAccountButton コンポーネントのテスト
 *
 * テスト観点:
 * - 「アカウントを削除」ボタンが存在する
 * - クリックで ConfirmDialog が開く
 * - ダイアログ内にメール入力欄が存在する
 * - メール不一致時に confirm ボタンが disabled
 * - メール一致時に confirm ボタンが有効
 * - confirm クリックで deleteAccount が呼ばれる
 * - エラー時に toast.error が呼ばれる
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteAccountButton } from '@/features/account/components/DeleteAccountButton';

// Server Action をモック化
jest.mock('@/features/auth/actions/delete-account', () => ({
  deleteAccount: jest.fn(),
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

import { deleteAccount } from '@/features/auth/actions/delete-account';
const mockDeleteAccount = deleteAccount as jest.MockedFunction<typeof deleteAccount>;

const TEST_EMAIL = 'test@example.com';

function renderComponent() {
  return render(<DeleteAccountButton userEmail={TEST_EMAIL} />);
}

describe('DeleteAccountButton', () => {
  beforeEach(() => {
    mockDeleteAccount.mockReset();
    mockToastError.mockReset();
  });

  describe('表示確認', () => {
    it('「アカウントを削除」ボタンが存在する', () => {
      renderComponent();
      expect(screen.getByRole('button', { name: 'アカウントを削除' })).toBeInTheDocument();
    });

    it('初期状態でダイアログは表示されない', () => {
      renderComponent();
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('ダイアログ開閉', () => {
    it('「アカウントを削除」ボタンクリックで ConfirmDialog が開く', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByRole('button', { name: 'アカウントを削除' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('ダイアログ内にメールアドレス確認の入力欄が存在する', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByRole('button', { name: 'アカウントを削除' }));
      expect(
        screen.getByRole('textbox', { name: 'メールアドレスの確認入力' })
      ).toBeInTheDocument();
    });
  });

  describe('確認ボタンの有効/無効', () => {
    it('メールアドレスが空のとき confirm ボタンが disabled', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByRole('button', { name: 'アカウントを削除' }));
      // 削除する ボタン (confirmLabel)
      const confirmButton = screen.getByRole('button', { name: '削除する' });
      expect(confirmButton).toBeDisabled();
    });

    it('メールアドレスが不一致のとき confirm ボタンが disabled', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByRole('button', { name: 'アカウントを削除' }));
      const input = screen.getByRole('textbox', { name: 'メールアドレスの確認入力' });
      // type="email" の input は userEvent.type で @ が正しく入力されないため fireEvent.change を使用
      fireEvent.change(input, { target: { value: 'wrong@example.com' } });
      const confirmButton = screen.getByRole('button', { name: '削除する' });
      expect(confirmButton).toBeDisabled();
    });

    it('メールアドレスが一致したとき confirm ボタンが有効になる', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByRole('button', { name: 'アカウントを削除' }));
      const input = screen.getByRole('textbox', { name: 'メールアドレスの確認入力' });
      // type="email" の input は userEvent.type で @ が正しく入力されないため fireEvent.change を使用
      fireEvent.change(input, { target: { value: TEST_EMAIL } });
      const confirmButton = screen.getByRole('button', { name: '削除する' });
      expect(confirmButton).not.toBeDisabled();
    });
  });

  describe('削除実行', () => {
    it('confirm クリックで deleteAccount が confirmEmail 付きで呼ばれる', async () => {
      mockDeleteAccount.mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByRole('button', { name: 'アカウントを削除' }));
      const input = screen.getByRole('textbox', { name: 'メールアドレスの確認入力' });
      // type="email" の input は userEvent.type で @ が正しく入力されないため fireEvent.change を使用
      fireEvent.change(input, { target: { value: TEST_EMAIL } });
      await user.click(screen.getByRole('button', { name: '削除する' }));
      await waitFor(() => {
        expect(mockDeleteAccount).toHaveBeenCalledWith({ confirmEmail: TEST_EMAIL });
      });
    });

    it('deleteAccount が ok:false を返したとき toast.error が呼ばれる', async () => {
      mockDeleteAccount.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'アカウントの削除に失敗しました。' },
      });
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByRole('button', { name: 'アカウントを削除' }));
      const input = screen.getByRole('textbox', { name: 'メールアドレスの確認入力' });
      fireEvent.change(input, { target: { value: TEST_EMAIL } });
      await user.click(screen.getByRole('button', { name: '削除する' }));
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('アカウントの削除に失敗しました。');
      });
    });

    it('deleteAccount がエラーをスローしたとき toast.error が呼ばれる', async () => {
      mockDeleteAccount.mockRejectedValue(new Error('network error'));
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByRole('button', { name: 'アカウントを削除' }));
      const input = screen.getByRole('textbox', { name: 'メールアドレスの確認入力' });
      fireEvent.change(input, { target: { value: TEST_EMAIL } });
      await user.click(screen.getByRole('button', { name: '削除する' }));
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          'アカウントの削除に失敗しました。もう一度お試しください。'
        );
      });
    });
  });
});
