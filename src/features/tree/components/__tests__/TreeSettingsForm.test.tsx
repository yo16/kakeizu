/**
 * TreeSettingsForm コンポーネントのテスト
 *
 * フォームの初期表示・バリデーション・サーバーエラー・送信中状態を検証する。
 */

// useToast をモック
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual('@/components/ui');
  return {
    ...actual,
    useToast: jest.fn(),
  };
});

// updateTree アクションをモック
jest.mock('@/features/tree/actions/update-tree', () => ({
  updateTree: jest.fn(),
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useToast } from '@/components/ui';
import { updateTree } from '@/features/tree/actions/update-tree';
import { TreeSettingsForm } from '../TreeSettingsForm';

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockUpdateTree = updateTree as jest.MockedFunction<typeof updateTree>;

/** テスト用デフォルト Props */
const DEFAULT_PROPS = {
  treeId: 'aaaaaaaa-0000-0000-0000-000000000001',
  defaultValues: {
    title: 'テスト家系図',
    description: 'テストの説明文',
  },
};

/** useToast のセットアップ */
function setupToast() {
  mockUseToast.mockReturnValue({
    success: mockToastSuccess,
    error: mockToastError,
    show: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
    dismiss: jest.fn(),
  });
}

describe('TreeSettingsForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupToast();
  });

  // ---------------------------------------------------------------------------
  // 初期表示
  // ---------------------------------------------------------------------------
  describe('初期表示', () => {
    it('defaultValues のタイトルが input にセットされていること', () => {
      render(<TreeSettingsForm {...DEFAULT_PROPS} />);

      const titleInput = screen.getByRole('textbox', { name: /タイトル/ });
      expect(titleInput).toHaveValue('テスト家系図');
    });

    it('defaultValues の説明が textarea にセットされていること', () => {
      render(<TreeSettingsForm {...DEFAULT_PROPS} />);

      const descriptionInput = screen.getByRole('textbox', { name: /説明/ });
      expect(descriptionInput).toHaveValue('テストの説明文');
    });

    it('description が null の場合、textarea は空文字で表示されること', () => {
      render(
        <TreeSettingsForm
          treeId={DEFAULT_PROPS.treeId}
          defaultValues={{ title: 'タイトル', description: null }}
        />
      );

      const descriptionInput = screen.getByRole('textbox', { name: /説明/ });
      expect(descriptionInput).toHaveValue('');
    });

    it('送信ボタンが有効な状態で表示されること', () => {
      render(<TreeSettingsForm {...DEFAULT_PROPS} />);

      const submitButton = screen.getByRole('button', { name: '保存する' });
      expect(submitButton).not.toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // バリデーション（正常系）
  // ---------------------------------------------------------------------------
  describe('正常な送信', () => {
    it('タイトル・説明を入力して submit → updateTree が正しい引数で呼ばれること', async () => {
      mockUpdateTree.mockResolvedValue({ ok: true, data: undefined });
      const user = userEvent.setup();

      render(<TreeSettingsForm {...DEFAULT_PROPS} />);

      const titleInput = screen.getByRole('textbox', { name: /タイトル/ });
      await user.clear(titleInput);
      await user.type(titleInput, '新しいタイトル');

      await user.click(screen.getByRole('button', { name: '保存する' }));

      await waitFor(() => {
        expect(mockUpdateTree).toHaveBeenCalledWith(
          expect.objectContaining({
            treeId: DEFAULT_PROPS.treeId,
            title: '新しいタイトル',
          })
        );
      });
    });

    it('成功時 Toast success("保存しました") が呼ばれること', async () => {
      mockUpdateTree.mockResolvedValue({ ok: true, data: undefined });
      const user = userEvent.setup();

      render(<TreeSettingsForm {...DEFAULT_PROPS} />);

      await user.click(screen.getByRole('button', { name: '保存する' }));

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('保存しました');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // バリデーション（異常系）
  // ---------------------------------------------------------------------------
  describe('クライアントサイドバリデーション', () => {
    it('タイトルを空にして submit → エラーが表示され updateTree が呼ばれないこと', async () => {
      render(<TreeSettingsForm {...DEFAULT_PROPS} />);

      const titleInput = screen.getByRole('textbox', { name: /タイトル/ });
      fireEvent.change(titleInput, { target: { value: '' } });

      const submitButton = screen.getByRole('button', { name: '保存する' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getAllByText(/タイトルを入力してください/)[0]).toBeInTheDocument();
      });
      expect(mockUpdateTree).not.toHaveBeenCalled();
    });

    it('タイトル101文字で submit → エラーが表示され updateTree が呼ばれないこと', async () => {
      render(<TreeSettingsForm {...DEFAULT_PROPS} />);

      const titleInput = screen.getByRole('textbox', { name: /タイトル/ });
      fireEvent.change(titleInput, { target: { value: 'あ'.repeat(101) } });

      const submitButton = screen.getByRole('button', { name: '保存する' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getAllByText(/100文字以内/)[0]).toBeInTheDocument();
      });
      expect(mockUpdateTree).not.toHaveBeenCalled();
    });

    it('説明501文字で submit → エラーが表示され updateTree が呼ばれないこと', async () => {
      render(<TreeSettingsForm {...DEFAULT_PROPS} />);

      const titleInput = screen.getByRole('textbox', { name: /タイトル/ });
      fireEvent.change(titleInput, { target: { value: 'テストタイトル' } });

      const descriptionInput = screen.getByRole('textbox', { name: /説明/ });
      fireEvent.change(descriptionInput, { target: { value: 'あ'.repeat(501) } });

      const submitButton = screen.getByRole('button', { name: '保存する' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/500文字以内/)).toBeInTheDocument();
      });
      expect(mockUpdateTree).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // サーバーエラー
  // ---------------------------------------------------------------------------
  describe('サーバーエラーハンドリング', () => {
    it('field="title" エラー → タイトルフィールドエラーが表示されること', async () => {
      mockUpdateTree.mockResolvedValue({
        ok: false,
        error: { field: 'title', message: 'タイトルエラー' },
      });
      const user = userEvent.setup();

      render(<TreeSettingsForm {...DEFAULT_PROPS} />);

      await user.click(screen.getByRole('button', { name: '保存する' }));

      await waitFor(() => {
        expect(screen.getAllByText('タイトルエラー')[0]).toBeInTheDocument();
      });
    });

    it('field="description" エラー → 説明フィールドエラーが表示されること', async () => {
      mockUpdateTree.mockResolvedValue({
        ok: false,
        error: { field: 'description', message: '説明エラー' },
      });
      const user = userEvent.setup();

      render(<TreeSettingsForm {...DEFAULT_PROPS} />);

      await user.click(screen.getByRole('button', { name: '保存する' }));

      await waitFor(() => {
        expect(screen.getByText('説明エラー')).toBeInTheDocument();
      });
    });

    it('field 未指定エラー → root エラーが role="alert" で表示されること', async () => {
      mockUpdateTree.mockResolvedValue({
        ok: false,
        error: { message: '不明なエラー' },
      });
      const user = userEvent.setup();

      render(<TreeSettingsForm {...DEFAULT_PROPS} />);

      await user.click(screen.getByRole('button', { name: '保存する' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('不明なエラー');
      });
    });

    it('updateTree が例外を throw → 「保存に失敗しました」root エラーが表示されること', async () => {
      mockUpdateTree.mockRejectedValue(new Error('Network error'));
      const user = userEvent.setup();

      render(<TreeSettingsForm {...DEFAULT_PROPS} />);

      await user.click(screen.getByRole('button', { name: '保存する' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          '保存に失敗しました。もう一度お試しください。'
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 送信中の状態
  // ---------------------------------------------------------------------------
  describe('送信中の状態', () => {
    it('送信中は保存ボタンが disabled になること', async () => {
      // 解決しない Promise で送信中状態を保持
      mockUpdateTree.mockImplementation(() => new Promise(() => {}));
      const user = userEvent.setup();

      render(<TreeSettingsForm {...DEFAULT_PROPS} />);

      await user.click(screen.getByRole('button', { name: '保存する' }));

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: '保存する' });
        expect(submitButton).toBeDisabled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // description が null のデフォルト動作
  // ---------------------------------------------------------------------------
  describe('description が null の場合の送信', () => {
    it('description=null の defaultValues で submit → updateTree に空文字または null の description が渡されること', async () => {
      mockUpdateTree.mockResolvedValue({ ok: true, data: undefined });
      const user = userEvent.setup();

      render(
        <TreeSettingsForm
          treeId={DEFAULT_PROPS.treeId}
          defaultValues={{ title: 'タイトル', description: null }}
        />
      );

      await user.click(screen.getByRole('button', { name: '保存する' }));

      await waitFor(() => {
        expect(mockUpdateTree).toHaveBeenCalledWith(
          expect.objectContaining({
            treeId: DEFAULT_PROPS.treeId,
            title: 'タイトル',
            // description は実装上 '' → null に変換されるため null を期待
            description: null,
          })
        );
      });
    });
  });
});
