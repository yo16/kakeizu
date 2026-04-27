/**
 * WizardStepChildren コンポーネントのテスト
 *
 * テスト観点:
 * - 「子どもを追加する」ボタンでフォームが表示されること
 * - 子0人時のボタンラベルが「子を追加せずに完了」であること
 * - 1人以上追加後のボタンラベルが「完了」であること
 * - フォーム送信で quickAddRelative('child') が呼ばれること
 * - 追加後にリストに表示されること
 * - 「完了」で onComplete が呼ばれること
 */

// quickAddRelative Server Action をモック
jest.mock('@/features/relation/actions/quick-add-relative', () => ({
  quickAddRelative: jest.fn(),
}));

// PersonForm を軽量スタブに差し替え
let mockSubmitDisplayName = '子太郎';

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
          void onSubmit({ displayName: mockSubmitDisplayName });
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
import { WizardStepChildren } from '../WizardStepChildren';

const mockQuickAddRelative = quickAddRelative as jest.MockedFunction<typeof quickAddRelative>;

describe('WizardStepChildren', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitDisplayName = '子太郎';
  });

  // ---------------------------------------------------------------------------
  // 初期表示
  // ---------------------------------------------------------------------------
  describe('初期表示', () => {
    it('「子どもを追加する」ボタンが表示されること', () => {
      render(
        <WizardStepChildren originPersonId="person-abc" onComplete={jest.fn()} />
      );

      expect(screen.getByRole('button', { name: '子どもを追加する' })).toBeInTheDocument();
    });

    it('子0人の時、「子を追加せずに完了」ボタンが表示されること', () => {
      render(
        <WizardStepChildren originPersonId="person-abc" onComplete={jest.fn()} />
      );

      expect(screen.getByRole('button', { name: '子を追加せずに完了' })).toBeInTheDocument();
    });

    it('初期表示では PersonForm は表示されないこと', () => {
      render(
        <WizardStepChildren originPersonId="person-abc" onComplete={jest.fn()} />
      );

      expect(screen.queryByTestId('person-form')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // フォーム表示
  // ---------------------------------------------------------------------------
  describe('フォーム表示', () => {
    it('「子どもを追加する」ボタンを押すと PersonForm が表示されること', async () => {
      const user = userEvent.setup();

      render(
        <WizardStepChildren originPersonId="person-abc" onComplete={jest.fn()} />
      );

      await user.click(screen.getByRole('button', { name: '子どもを追加する' }));

      expect(screen.getByTestId('person-form')).toBeInTheDocument();
    });

    it('PersonForm 表示中は「子どもを追加する」ボタンが非表示になること', async () => {
      const user = userEvent.setup();

      render(
        <WizardStepChildren originPersonId="person-abc" onComplete={jest.fn()} />
      );

      await user.click(screen.getByRole('button', { name: '子どもを追加する' }));

      expect(screen.queryByRole('button', { name: '子どもを追加する' })).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 子追加（正常系）
  // ---------------------------------------------------------------------------
  describe('子追加（正常系）', () => {
    it('フォーム送信で quickAddRelative が kind=child で呼ばれること', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: 'child-id-1' },
      });
      const user = userEvent.setup();

      render(
        <WizardStepChildren originPersonId="person-abc" onComplete={jest.fn()} />
      );

      await user.click(screen.getByRole('button', { name: '子どもを追加する' }));

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(mockQuickAddRelative).toHaveBeenCalledWith(
          expect.objectContaining({
            originPersonId: 'person-abc',
            kind: 'child',
          })
        );
      });
    });

    it('1人追加後に追加リストに名前が表示されること', async () => {
      mockSubmitDisplayName = '子太郎';
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: 'child-id-1' },
      });
      const user = userEvent.setup();

      render(
        <WizardStepChildren originPersonId="person-abc" onComplete={jest.fn()} />
      );

      await user.click(screen.getByRole('button', { name: '子どもを追加する' }));

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(screen.getByText('子太郎')).toBeInTheDocument();
      });
    });

    it('1人追加後にボタンラベルが「完了」になること', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: 'child-id-1' },
      });
      const user = userEvent.setup();

      render(
        <WizardStepChildren originPersonId="person-abc" onComplete={jest.fn()} />
      );

      await user.click(screen.getByRole('button', { name: '子どもを追加する' }));

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '完了' })).toBeInTheDocument();
      });
    });

    it('1人追加後に「さらに追加する」ボタンが表示されること', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: 'child-id-1' },
      });
      const user = userEvent.setup();

      render(
        <WizardStepChildren originPersonId="person-abc" onComplete={jest.fn()} />
      );

      await user.click(screen.getByRole('button', { name: '子どもを追加する' }));

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'さらに追加する' })).toBeInTheDocument();
      });
    });

    it('追加後に PersonForm が非表示になること（フォームが閉じること）', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: 'child-id-1' },
      });
      const user = userEvent.setup();

      render(
        <WizardStepChildren originPersonId="person-abc" onComplete={jest.fn()} />
      );

      await user.click(screen.getByRole('button', { name: '子どもを追加する' }));

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(screen.queryByTestId('person-form')).not.toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 子追加（異常系）
  // ---------------------------------------------------------------------------
  describe('子追加（異常系）', () => {
    it('quickAddRelative 失敗時にエラートーストが表示されること', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: false,
        error: { message: '子の追加に失敗しました' },
      });
      const user = userEvent.setup();

      render(
        <WizardStepChildren originPersonId="person-abc" onComplete={jest.fn()} />
      );

      await user.click(screen.getByRole('button', { name: '子どもを追加する' }));

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('子の追加に失敗しました');
      });
    });

    it('quickAddRelative 失敗時には追加リストに追加されないこと', async () => {
      mockSubmitDisplayName = '失敗子';
      mockQuickAddRelative.mockResolvedValue({
        ok: false,
        error: { message: 'エラー' },
      });
      const user = userEvent.setup();

      render(
        <WizardStepChildren originPersonId="person-abc" onComplete={jest.fn()} />
      );

      await user.click(screen.getByRole('button', { name: '子どもを追加する' }));

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
      expect(screen.queryByText('失敗子')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 完了操作
  // ---------------------------------------------------------------------------
  describe('完了操作', () => {
    it('子0人で「子を追加せずに完了」ボタンを押すと onComplete が呼ばれること', async () => {
      const onComplete = jest.fn();
      const user = userEvent.setup();

      render(
        <WizardStepChildren originPersonId="person-abc" onComplete={onComplete} />
      );

      await user.click(screen.getByRole('button', { name: '子を追加せずに完了' }));

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('子1人追加後に「完了」ボタンを押すと onComplete が呼ばれること', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: 'child-id-1' },
      });
      const onComplete = jest.fn();
      const user = userEvent.setup();

      render(
        <WizardStepChildren originPersonId="person-abc" onComplete={onComplete} />
      );

      await user.click(screen.getByRole('button', { name: '子どもを追加する' }));

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '完了' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: '完了' }));

      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });
});
