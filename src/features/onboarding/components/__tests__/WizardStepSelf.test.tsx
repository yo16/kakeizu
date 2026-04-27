/**
 * WizardStepSelf コンポーネントのテスト
 *
 * テスト観点:
 * - フォーム送信で createPerson が呼ばれること
 * - 成功時に onComplete(personId) が呼ばれること
 * - 失敗時にエラートーストが表示されること
 */

// createPerson Server Action をモック
jest.mock('@/features/person/actions', () => ({
  createPerson: jest.fn(),
}));

// PersonForm を軽量スタブに差し替え（フォームロジックをテスト対象から分離）
jest.mock('@/features/person/components/PersonForm', () => ({
  PersonForm: function MockPersonForm({
    onSubmit,
    submitLabel,
    isSubmitting,
  }: {
    onSubmit: (values: { displayName: string }) => Promise<void>;
    submitLabel?: string;
    isSubmitting?: boolean;
  }) {
    return (
      <form
        data-testid="person-form"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({ displayName: 'テスト太郎' });
        }}
      >
        <span data-testid="submit-label">{submitLabel}</span>
        <span data-testid="is-submitting">{String(isSubmitting)}</span>
        <button type="submit">送信</button>
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
import { createPerson } from '@/features/person/actions';
import { WizardStepSelf } from '../WizardStepSelf';

const mockCreatePerson = createPerson as jest.MockedFunction<typeof createPerson>;

describe('WizardStepSelf', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 初期表示
  // ---------------------------------------------------------------------------
  describe('初期表示', () => {
    it('PersonForm が表示されること', () => {
      const onComplete = jest.fn();
      render(<WizardStepSelf treeId="tree-123" onComplete={onComplete} />);

      expect(screen.getByTestId('person-form')).toBeInTheDocument();
    });

    it('送信ボタンラベルが「次へ進む」であること', () => {
      const onComplete = jest.fn();
      render(<WizardStepSelf treeId="tree-123" onComplete={onComplete} />);

      expect(screen.getByTestId('submit-label')).toHaveTextContent('次へ進む');
    });

    it('説明文が表示されること', () => {
      const onComplete = jest.fn();
      render(<WizardStepSelf treeId="tree-123" onComplete={onComplete} />);

      expect(
        screen.getByText(/あなた自身（または家系図の中心となる人物）の情報を入力/)
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系
  // ---------------------------------------------------------------------------
  describe('正常系', () => {
    it('フォーム送信時に createPerson が treeId 付きで呼ばれること', async () => {
      mockCreatePerson.mockResolvedValue({
        ok: true,
        data: { personId: 'person-new-id' },
      });
      const onComplete = jest.fn();

      render(<WizardStepSelf treeId="tree-abc" onComplete={onComplete} />);

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(mockCreatePerson).toHaveBeenCalledTimes(1);
      });
      expect(mockCreatePerson).toHaveBeenCalledWith(
        expect.objectContaining({ treeId: 'tree-abc' })
      );
    });

    it('createPerson 成功時に onComplete(personId) が呼ばれること', async () => {
      mockCreatePerson.mockResolvedValue({
        ok: true,
        data: { personId: 'person-new-id' },
      });
      const onComplete = jest.fn();

      render(<WizardStepSelf treeId="tree-123" onComplete={onComplete} />);

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledWith('person-new-id');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系
  // ---------------------------------------------------------------------------
  describe('異常系', () => {
    it('createPerson 失敗時にエラートーストが表示されること', async () => {
      mockCreatePerson.mockResolvedValue({
        ok: false,
        error: { message: '人物の作成に失敗しました' },
      });
      const onComplete = jest.fn();

      render(<WizardStepSelf treeId="tree-123" onComplete={onComplete} />);

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('人物の作成に失敗しました');
      });
    });

    it('createPerson 失敗時に onComplete は呼ばれないこと', async () => {
      mockCreatePerson.mockResolvedValue({
        ok: false,
        error: { message: 'エラー' },
      });
      const onComplete = jest.fn();

      render(<WizardStepSelf treeId="tree-123" onComplete={onComplete} />);

      await act(async () => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 送信中状態
  // ---------------------------------------------------------------------------
  describe('送信中状態', () => {
    it('送信中は isSubmitting=true が PersonForm に渡されること', async () => {
      // 解決しない Promise で送信中状態を保持
      mockCreatePerson.mockImplementation(() => new Promise(() => {}));
      const onComplete = jest.fn();

      render(<WizardStepSelf treeId="tree-123" onComplete={onComplete} />);

      act(() => {
        fireEvent.submit(screen.getByTestId('person-form'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-submitting')).toHaveTextContent('true');
      });
    });
  });
});
