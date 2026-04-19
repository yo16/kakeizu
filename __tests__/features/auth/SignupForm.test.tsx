/**
 * SignupForm コンポーネントのテスト
 *
 * テスト観点:
 * - email / password / passwordConfirm の入力欄が存在
 * - passwordConfirm 不一致でバリデーションエラー
 * - 正常送信で signUpWithPassword が { email, password } で呼ばれる（passwordConfirm なし）
 * - 成功時に EmailVerificationNotice が表示される
 * - 失敗時にエラーメッセージが表示される
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignupForm } from '@/features/auth/components/SignupForm';

// Server Action をモック化
jest.mock('@/features/auth/actions/sign-up', () => ({
  signUpWithPassword: jest.fn(),
}));

import { signUpWithPassword } from '@/features/auth/actions/sign-up';
const mockSignUp = signUpWithPassword as jest.MockedFunction<typeof signUpWithPassword>;

/**
 * FormLabel の required prop により label 内に <span aria-hidden="true">*</span> が挿入されるため
 * getByLabelText(/^パスワード$/) ではマッチしない。name 属性でinputを直接取得するヘルパー。
 */
function getPasswordInput(): HTMLElement {
  // eslint-disable-next-line testing-library/no-node-access
  return document.querySelector('input[name="password"]') as HTMLElement;
}

describe('SignupForm', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
  });

  describe('フィールドの存在確認', () => {
    it('メールアドレスの入力欄がラベル付きで存在する', () => {
      render(<SignupForm />);
      expect(screen.getByLabelText(/メールアドレス/)).toBeInTheDocument();
    });

    it('パスワードの入力欄が存在する', () => {
      render(<SignupForm />);
      expect(getPasswordInput()).toBeInTheDocument();
    });

    it('パスワード（確認）の入力欄がラベル付きで存在する', () => {
      render(<SignupForm />);
      expect(screen.getByLabelText(/パスワード（確認）/)).toBeInTheDocument();
    });

    it('送信ボタンが存在する', () => {
      render(<SignupForm />);
      expect(screen.getByRole('button', { name: /アカウントを作成/ })).toBeInTheDocument();
    });
  });

  describe('バリデーション', () => {
    it('パスワードと確認用パスワードが不一致のときエラーが表示される', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.type(getPasswordInput(), 'password123');
      await user.type(screen.getByLabelText(/パスワード（確認）/), 'different123');
      await user.click(screen.getByRole('button', { name: /アカウントを作成/ }));
      await waitFor(() => {
        // Input 内部と FormError の両方に同じテキストが表示されるため getAllByText を使用
        const messages = screen.getAllByText('パスワードが一致しません');
        expect(messages.length).toBeGreaterThan(0);
      });
    });

    it('不一致時は signUpWithPassword が呼ばれない', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.type(getPasswordInput(), 'password123');
      await user.type(screen.getByLabelText(/パスワード（確認）/), 'different123');
      await user.click(screen.getByRole('button', { name: /アカウントを作成/ }));
      await waitFor(() => {
        const messages = screen.getAllByText('パスワードが一致しません');
        expect(messages.length).toBeGreaterThan(0);
      });
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('無効なメールアドレスでエラーが表示される', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'invalid-email');
      await user.type(getPasswordInput(), 'password123');
      await user.type(screen.getByLabelText(/パスワード（確認）/), 'password123');
      await user.click(screen.getByRole('button', { name: /アカウントを作成/ }));
      await waitFor(() => {
        const messages = screen.getAllByText('有効なメールアドレスを入力してください');
        expect(messages.length).toBeGreaterThan(0);
      });
    });

    it('8文字未満のパスワードでエラーが表示される', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.type(getPasswordInput(), 'short');
      await user.type(screen.getByLabelText(/パスワード（確認）/), 'short');
      await user.click(screen.getByRole('button', { name: /アカウントを作成/ }));
      await waitFor(() => {
        const messages = screen.getAllByText('パスワードは8文字以上で入力してください');
        expect(messages.length).toBeGreaterThan(0);
      });
    });
  });

  describe('正常送信', () => {
    it('signUpWithPassword が { email, password } で呼ばれる（passwordConfirm は含まれない）', async () => {
      mockSignUp.mockResolvedValue({ ok: true } as never);
      const user = userEvent.setup();
      render(<SignupForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.type(getPasswordInput(), 'password123');
      await user.type(screen.getByLabelText(/パスワード（確認）/), 'password123');
      await user.click(screen.getByRole('button', { name: /アカウントを作成/ }));
      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
        });
      });
      // passwordConfirm が引数に含まれていないことを確認
      expect(mockSignUp).not.toHaveBeenCalledWith(
        expect.objectContaining({ passwordConfirm: expect.anything() })
      );
    });

    it('成功時に EmailVerificationNotice が表示される（メールアドレスのテキストが表示される）', async () => {
      mockSignUp.mockResolvedValue({ ok: true } as never);
      const user = userEvent.setup();
      render(<SignupForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.type(getPasswordInput(), 'password123');
      await user.type(screen.getByLabelText(/パスワード（確認）/), 'password123');
      await user.click(screen.getByRole('button', { name: /アカウントを作成/ }));
      await waitFor(() => {
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
      });
      // フォームが非表示になっていることを確認
      expect(screen.queryByRole('button', { name: /アカウントを作成/ })).not.toBeInTheDocument();
    });
  });

  describe('Server Action エラーハンドリング', () => {
    it('root エラー時にエラーメッセージが画面に表示される', async () => {
      mockSignUp.mockResolvedValue({
        ok: false,
        error: { message: 'サーバーエラーが発生しました' },
      } as never);
      const user = userEvent.setup();
      render(<SignupForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.type(getPasswordInput(), 'password123');
      await user.type(screen.getByLabelText(/パスワード（確認）/), 'password123');
      await user.click(screen.getByRole('button', { name: /アカウントを作成/ }));
      await waitFor(() => {
        expect(screen.getByText('サーバーエラーが発生しました')).toBeInTheDocument();
      });
    });

    it('email フィールドエラー時にメールアドレス欄にエラーが表示される', async () => {
      mockSignUp.mockResolvedValue({
        ok: false,
        error: { field: 'email', message: 'このメールアドレスは既に登録されています' },
      } as never);
      const user = userEvent.setup();
      render(<SignupForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.type(getPasswordInput(), 'password123');
      await user.type(screen.getByLabelText(/パスワード（確認）/), 'password123');
      await user.click(screen.getByRole('button', { name: /アカウントを作成/ }));
      await waitFor(() => {
        const messages = screen.getAllByText('このメールアドレスは既に登録されています');
        expect(messages.length).toBeGreaterThan(0);
      });
    });
  });
});
