/**
 * WizardStepSpouse コンポーネントのテスト
 *
 * テスト観点:
 * - 「配偶者を追加せずに次へ」ボタンで onSkip が呼ばれること
 * - 「配偶者を追加する」ボタンでフォームが表示されること
 * - フォーム送信で quickAddRelative('spouse') が呼ばれること
 * - 成功時に onComplete が呼ばれること
 * - 失敗時にエラートーストが表示されること
 */

// quickAddRelative Server Action をモック
jest.mock('@/features/relation/actions/quick-add-relative', () => ({
  quickAddRelative: jest.fn(),
}));

// PersonForm を軽量スタブに差し替え
jest.mock('@/features/person/components/PersonForm', () => ({
  PersonForm: function MockPersonForm({
    onSubmit,
    submitLabel,
    onCancel,
  }: {
    onSubmit: (values: { displayName: string }) => Promise<void>;
    submitLabel?: string;
    onCancel?: () => void;
  }) {
    return (
      <form
        data-testid="person-form"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({ displayName: '配偶者花子' });
        }}
      >
        <span data-testid="submit-label">{submitLabel}</span>
        <button type="submit">送信</button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            キャンセル
          </button>
        )}
      </form>
    );
  },
}));

// Toast をモック
const mockToastError = jest.fn();
jest.mock('@/components/ui', () => ({
  ...jest.requireActual('@/components/ui'),
  useToast: () => ({
    show: jest.fn(),
    success: jest.fn(),
    error: mockToastError,
    warning: jest.fn(),
    info: jest.fn(),
    dismiss: jest.fn(),
  }),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { quickAddRelative } from '@/features/relation/actions/quick-add-relative';
import { WizardStepSpouse } from '../WizardStepSpouse';

const mockQuickAddRelative = quickAddRelative as jest.MockedFunction<typeof quickAddRelative>;

describe('WizardStepSpouse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 初期表示（フォーム非表示の選択画面）
  // ---------------------------------------------------------------------------
  describe('初期表示', () => {
    it('「配偶者を追加する」ボタンが表示されること', () => {
      render(
        <WizardStepSpouse
          originPersonId="person-abc"
          onComplete={jest.fn()}
          onSkip={jest.fn()}
        />
      );

      expect(screen.getByRole('button', { name: '配偶者を追加する' })).toBeInTheDocument();
    });

    it('「配偶者を追加せずに次へ」ボタンが表示されること', () => {
      render(
        <WizardStepSpouse
          originPersonId="person-abc"
          onComplete={jest.fn()}
          onSkip={jest.fn()}
        />
      );

      expect(
        screen.getByRole('button', { name: '配偶者を追加せずに次へ' })
      ).toBeInTheDocument();
    });

    it('初期表示では PersonForm は表示されないこと', () => {
      render(
        <WizardStepSpouse
          originPersonId="person-abc"
          onComplete={jest.fn()}
          onSkip={jest.fn()}
        />
      );

      expect(screen.queryByTestId('person-form')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // スキップ操作
  // ---------------------------------------------------------------------------
  describe('スキップ操作', () => {
    it('「配偶者を追加せずに次へ」ボタンを押すと onSkip が呼ばれること', async () => {
      const onSkip = jest.fn();
      const user = userEvent.setup();

      render(
        <WizardStepSpouse
          originPersonId="person-abc"
          onComplete={jest.fn()}
          onSkip={onSkip}
        />
      );

      await user.click(screen.getByRole('button', { name: '配偶者を追加せずに次へ' }));

      expect(onSkip).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // フォーム表示
  // ---------------------------------------------------------------------------
  describe('フォーム表示', () => {
    it('「配偶者を追加する」ボタンを押すと PersonForm が表示されること', async () => {
      const user = userEvent.setup();

      render(
        <WizardStepSpouse
          originPersonId="person-abc"
          onComplete={jest.fn()}
          onSkip={jest.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: '配偶者を追加する' }));

      expect(screen.getByTestId('person-form')).toBeInTheDocument();
    });

    it('PersonForm 表示後、送信ラベルが「追加して次へ」であること', async () => {
      const user = userEvent.setup();

      render(
        <WizardStepSpouse
          originPersonId="person-abc"
          onComplete={jest.fn()}
          onSkip={jest.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: '配偶者を追加する' }));

      expect(screen.getByTestId('submit-label')).toHaveTextContent('追加して次へ');
    });
  });

  // ---------------------------------------------------------------------------
  // フォーム送信（正常系）
  // ---------------------------------------------------------------------------
  describe('正常系', () => {
    it('フォーム送信で quickAddRelative が kind=spouse で呼ばれること', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: 'spouse-id' },
      });
      const onComplete = jest.fn();
      const user = userEvent.setup();

      render(
        <WizardStepSpouse
          originPersonId="person-abc"
          onComplete={onComplete}
          onSkip={jest.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: '配偶者を追加する' }));

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(mockQuickAddRelative).toHaveBeenCalledWith(
          expect.objectContaining({
            originPersonId: 'person-abc',
            kind: 'spouse',
          })
        );
      });
    });

    it('quickAddRelative 成功時に onComplete が呼ばれること', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: 'spouse-id' },
      });
      const onComplete = jest.fn();
      const user = userEvent.setup();

      render(
        <WizardStepSpouse
          originPersonId="person-abc"
          onComplete={onComplete}
          onSkip={jest.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: '配偶者を追加する' }));

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // フォーム送信（異常系）
  // ---------------------------------------------------------------------------
  describe('異常系', () => {
    it('quickAddRelative 失敗時にエラートーストが表示されること', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: false,
        error: { message: '配偶者の追加に失敗しました' },
      });
      const user = userEvent.setup();

      render(
        <WizardStepSpouse
          originPersonId="person-abc"
          onComplete={jest.fn()}
          onSkip={jest.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: '配偶者を追加する' }));

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('配偶者の追加に失敗しました');
      });
    });

    it('quickAddRelative 失敗時に onComplete は呼ばれないこと', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: false,
        error: { message: 'エラー' },
      });
      const onComplete = jest.fn();
      const user = userEvent.setup();

      render(
        <WizardStepSpouse
          originPersonId="person-abc"
          onComplete={onComplete}
          onSkip={jest.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: '配偶者を追加する' }));

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
      expect(onComplete).not.toHaveBeenCalled();
    });
  });
});
