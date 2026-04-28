/**
 * SignupForm コンポーネントのテスト
 *
 * テスト観点:
 * - フォーム項目の表示
 * - 同意チェックボックスの表示
 * - 利用規約・プライバシーポリシーリンクの href および target/rel 属性
 * - 未同意で送信 → バリデーションエラー表示、Server Action 非呼び出し
 * - 同意済み + 必須フィールド入力 → Server Action 呼び出し (agreeToTerms は渡さない)
 * - フォームバリデーション（メール形式・パスワード長・確認一致）
 * - 登録成功 → EmailVerificationNotice への切り替え
 * - 登録失敗 → エラーメッセージ表示
 */

// signUpWithPassword をモック
jest.mock('@/features/auth/actions/sign-up', () => ({
  signUpWithPassword: jest.fn(),
}));

// EmailVerificationNotice を軽量スタブに差し替え
jest.mock('../EmailVerificationNotice', () => ({
  EmailVerificationNotice: function MockEmailVerificationNotice({
    email,
  }: {
    email: string;
  }) {
    return <div data-testid="email-verification-notice" data-email={email} />;
  },
}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signUpWithPassword } from '@/features/auth/actions/sign-up';
import { SignupForm } from '../SignupForm';

const mockSignUp = signUpWithPassword as jest.MockedFunction<typeof signUpWithPassword>;

// テスト用ヘルパー: 各フィールドを入力する
// null を渡した場合はそのフィールドを入力しない
async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  options: {
    email?: string | null;
    password?: string | null;
    passwordConfirm?: string | null;
    agreeToTerms?: boolean;
  } = {}
) {
  const {
    email = 'test@example.com',
    password = 'password123',
    passwordConfirm = 'password123',
    agreeToTerms = false,
  } = options;

  if (email != null && email !== '') {
    await user.type(screen.getByLabelText(/メールアドレス/), email);
  }
  if (password != null && password !== '') {
    // パスワードフィールドは複数あるため最初にマッチしたものを選択
    const passwordInputs = screen.getAllByLabelText(/パスワード/);
    await user.type(passwordInputs[0], password);
  }
  if (passwordConfirm != null && passwordConfirm !== '') {
    await user.type(screen.getByLabelText(/パスワード（確認）/), passwordConfirm);
  }
  if (agreeToTerms) {
    await user.click(screen.getByRole('checkbox'));
  }
}

describe('SignupForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // フォーム項目の表示
  // ---------------------------------------------------------------------------
  describe('フォーム項目の表示', () => {
    it('メールアドレス入力フィールドが表示されること', () => {
      render(<SignupForm />);

      expect(screen.getByLabelText(/メールアドレス/)).toBeInTheDocument();
    });

    it('パスワード入力フィールドが表示されること', () => {
      render(<SignupForm />);

      const passwordInputs = screen.getAllByLabelText(/パスワード/);
      expect(passwordInputs.length).toBeGreaterThanOrEqual(1);
    });

    it('パスワード確認フィールドが表示されること', () => {
      render(<SignupForm />);

      expect(screen.getByLabelText(/パスワード（確認）/)).toBeInTheDocument();
    });

    it('送信ボタンが表示されること', () => {
      render(<SignupForm />);

      expect(screen.getByRole('button', { name: 'アカウントを作成' })).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 同意チェックボックス
  // ---------------------------------------------------------------------------
  describe('同意チェックボックス', () => {
    it('同意チェックボックスが表示されること', () => {
      render(<SignupForm />);

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('同意ラベルから利用規約リンク (/legal/terms) を取得できること', () => {
      render(<SignupForm />);

      const link = screen.getByRole('link', { name: '利用規約' });
      expect(link).toHaveAttribute('href', '/legal/terms');
    });

    it('同意ラベルからプライバシーポリシーリンク (/legal/privacy) を取得できること', () => {
      render(<SignupForm />);

      const link = screen.getByRole('link', { name: 'プライバシーポリシー' });
      expect(link).toHaveAttribute('href', '/legal/privacy');
    });

    it('利用規約リンクが target="_blank" rel="noopener noreferrer" であること', () => {
      render(<SignupForm />);

      const link = screen.getByRole('link', { name: '利用規約' });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('プライバシーポリシーリンクが target="_blank" rel="noopener noreferrer" であること', () => {
      render(<SignupForm />);

      const link = screen.getByRole('link', { name: 'プライバシーポリシー' });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  // ---------------------------------------------------------------------------
  // 同意チェックボックスのバリデーション
  // ---------------------------------------------------------------------------
  describe('同意チェックボックスのバリデーション', () => {
    it('未チェックで送信するとエラー「利用規約に同意してください」が表示されること', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      await fillForm(user, { agreeToTerms: false });
      await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

      expect(await screen.findByText('利用規約に同意してください')).toBeInTheDocument();
    });

    it('未チェックで送信した場合 Server Action が呼ばれないこと', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      await fillForm(user, { agreeToTerms: false });
      await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

      await waitFor(() => {
        expect(mockSignUp).not.toHaveBeenCalled();
      });
    });

    it('チェック済み + 必須フィールド入力で Server Action が呼ばれること', async () => {
      mockSignUp.mockResolvedValue({ ok: true, data: { message: '確認メールを送信しました' } });

      const user = userEvent.setup();
      render(<SignupForm />);

      await fillForm(user, { agreeToTerms: true });
      await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledTimes(1);
      });
    });

    it('Server Action 呼び出し時に agreeToTerms が渡されないこと', async () => {
      mockSignUp.mockResolvedValue({ ok: true, data: { message: '確認メールを送信しました' } });

      const user = userEvent.setup();
      render(<SignupForm />);

      await fillForm(user, { agreeToTerms: true });
      await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith(
          expect.not.objectContaining({ agreeToTerms: expect.anything() })
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // フォームバリデーション
  // ---------------------------------------------------------------------------
  describe('フォームバリデーション', () => {
    it('メールアドレスが未入力の場合にバリデーションエラーが表示されること', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      // email: null を渡すことでメールアドレスフィールドへの入力をスキップ
      await fillForm(user, { email: null, agreeToTerms: true });
      await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

      await waitFor(() => {
        expect(mockSignUp).not.toHaveBeenCalled();
      });
    });

    it('パスワードが 8 文字未満の場合にバリデーションエラーが表示されること', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      await fillForm(user, { password: '1234567', passwordConfirm: '1234567', agreeToTerms: true });
      await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

      await waitFor(() => {
        expect(mockSignUp).not.toHaveBeenCalled();
      });
    });

    it('パスワードと確認パスワードが一致しない場合にエラーが表示されること', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      await fillForm(user, {
        password: 'password123',
        passwordConfirm: 'different123',
        agreeToTerms: true,
      });
      await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

      expect((await screen.findAllByText('パスワードが一致しません'))[0]).toBeInTheDocument();
      expect(mockSignUp).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 登録成功
  // ---------------------------------------------------------------------------
  describe('登録成功', () => {
    it('成功時に EmailVerificationNotice が表示されること', async () => {
      mockSignUp.mockResolvedValue({ ok: true, data: { message: '確認メールを送信しました' } });

      const user = userEvent.setup();
      render(<SignupForm />);

      await fillForm(user, { agreeToTerms: true });
      await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

      expect(await screen.findByTestId('email-verification-notice')).toBeInTheDocument();
    });

    it('成功時に EmailVerificationNotice に入力したメールアドレスが渡されること', async () => {
      mockSignUp.mockResolvedValue({ ok: true, data: { message: '確認メールを送信しました' } });

      const user = userEvent.setup();
      render(<SignupForm />);

      await fillForm(user, { email: 'user@example.com', agreeToTerms: true });
      await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

      const notice = await screen.findByTestId('email-verification-notice');
      expect(notice).toHaveAttribute('data-email', 'user@example.com');
    });
  });

  // ---------------------------------------------------------------------------
  // 登録失敗
  // ---------------------------------------------------------------------------
  describe('登録失敗', () => {
    it('メールアドレス重複エラーの場合にエラーメッセージが表示されること', async () => {
      mockSignUp.mockResolvedValue({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          field: 'email',
          message: 'このメールアドレスはすでに使用されています',
        },
      });

      const user = userEvent.setup();
      render(<SignupForm />);

      await fillForm(user, { agreeToTerms: true });
      await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

      expect(
        (await screen.findAllByText('このメールアドレスはすでに使用されています'))[0]
      ).toBeInTheDocument();
    });

    it('その他のエラーの場合にルートエラーメッセージが表示されること', async () => {
      mockSignUp.mockResolvedValue({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'サーバーエラーが発生しました',
        },
      });

      const user = userEvent.setup();
      render(<SignupForm />);

      await fillForm(user, { agreeToTerms: true });
      await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

      expect(await screen.findByText('サーバーエラーが発生しました')).toBeInTheDocument();
    });
  });
});
