/**
 * LoginForm コンポーネントのテスト
 *
 * テスト観点:
 * - email / password の入力欄がラベル付きで存在
 * - 空送信でバリデーションエラー
 * - 無効メールアドレスでバリデーションエラー
 * - 8文字未満のパスワードでバリデーションエラー
 * - 正常入力で signInWithPassword が正しい引数で呼ばれる
 * - Server Action が { ok: false } を返したときエラーが画面に表示される
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/features/auth/components/LoginForm';

// Server Action をモック化
jest.mock('@/features/auth/actions/sign-in', () => ({
  signInWithPassword: jest.fn(),
}));

// CSS Modules のモック（jest.config.ts の nextJest が自動対応するが念のため）

import { signInWithPassword } from '@/features/auth/actions/sign-in';
const mockSignIn = signInWithPassword as jest.MockedFunction<typeof signInWithPassword>;

describe('LoginForm', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
  });

  describe('フィールドの存在確認', () => {
    it('メールアドレスの入力欄がラベル付きで存在する', () => {
      render(<LoginForm />);
      expect(screen.getByLabelText(/メールアドレス/)).toBeInTheDocument();
    });

    it('パスワードの入力欄がラベル付きで存在する', () => {
      render(<LoginForm />);
      expect(screen.getByLabelText(/パスワード/)).toBeInTheDocument();
    });

    it('送信ボタンが存在する', () => {
      render(<LoginForm />);
      expect(screen.getByRole('button', { name: /ログイン/ })).toBeInTheDocument();
    });
  });

  describe('バリデーション', () => {
    it('空送信でメールアドレスのエラーが表示される', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);
      await user.click(screen.getByRole('button', { name: /ログイン/ }));
      await waitFor(() => {
        // Input 内部と FormError の両方に同じテキストが表示されるため getAllByText を使用
        const messages = screen.getAllByText('有効なメールアドレスを入力してください');
        expect(messages.length).toBeGreaterThan(0);
      });
    });

    it('無効なメールアドレスでエラーが表示される', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'invalid-email');
      await user.type(screen.getByLabelText(/パスワード/), 'password123');
      await user.click(screen.getByRole('button', { name: /ログイン/ }));
      await waitFor(() => {
        const messages = screen.getAllByText('有効なメールアドレスを入力してください');
        expect(messages.length).toBeGreaterThan(0);
      });
    });

    it('8文字未満のパスワードでエラーが表示される', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.type(screen.getByLabelText(/パスワード/), 'short');
      await user.click(screen.getByRole('button', { name: /ログイン/ }));
      await waitFor(() => {
        const messages = screen.getAllByText('パスワードは8文字以上で入力してください');
        expect(messages.length).toBeGreaterThan(0);
      });
    });

    it('バリデーションエラー時は signInWithPassword が呼ばれない', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);
      await user.click(screen.getByRole('button', { name: /ログイン/ }));
      await waitFor(() => {
        const messages = screen.getAllByText('有効なメールアドレスを入力してください');
        expect(messages.length).toBeGreaterThan(0);
      });
      expect(mockSignIn).not.toHaveBeenCalled();
    });
  });

  describe('正常送信', () => {
    it('正常入力で signInWithPassword が { email, password } で呼ばれる', async () => {
      // ok: true の場合は redirect が投げられる想定だが、テストではそこに到達しないよう
      // 一旦 ok: false を返してもコール確認はできる
      mockSignIn.mockResolvedValue({
        ok: false,
        error: { message: 'ログインに失敗しました' },
      } as never);
      const user = userEvent.setup();
      render(<LoginForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.type(screen.getByLabelText(/パスワード/), 'password123');
      await user.click(screen.getByRole('button', { name: /ログイン/ }));
      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
        });
      });
    });
  });

  describe('Server Action エラーハンドリング', () => {
    it('root エラー時にエラーメッセージが画面に表示される', async () => {
      mockSignIn.mockResolvedValue({
        ok: false,
        error: { message: 'メールアドレスまたはパスワードが正しくありません' },
      } as never);
      const user = userEvent.setup();
      render(<LoginForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.type(screen.getByLabelText(/パスワード/), 'password123');
      await user.click(screen.getByRole('button', { name: /ログイン/ }));
      await waitFor(() => {
        // root エラーは role="alert" の div に表示される（Input 内には表示されない）
        expect(
          screen.getByText('メールアドレスまたはパスワードが正しくありません')
        ).toBeInTheDocument();
      });
    });

    it('email フィールドエラー時にメールアドレス欄にエラーが表示される', async () => {
      mockSignIn.mockResolvedValue({
        ok: false,
        error: { field: 'email', message: 'このメールアドレスは登録されていません' },
      } as never);
      const user = userEvent.setup();
      render(<LoginForm />);
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.type(screen.getByLabelText(/パスワード/), 'password123');
      await user.click(screen.getByRole('button', { name: /ログイン/ }));
      await waitFor(() => {
        // Input 内部と FormError の両方に表示されるため getAllByText を使用
        const messages = screen.getAllByText('このメールアドレスは登録されていません');
        expect(messages.length).toBeGreaterThan(0);
      });
    });
  });
});
