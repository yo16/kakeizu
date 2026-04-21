/**
 * CreateTreeModal コンポーネントのテスト
 *
 * モーダル開閉・フォームバリデーション・API呼び出し・エラーハンドリングを検証する。
 */

// next/navigation をモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// createTree アクションをモック
jest.mock('@/features/tree/actions/create-tree', () => ({
  createTree: jest.fn(),
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { createTree } from '@/features/tree/actions/create-tree';
import { CreateTreeModal } from '../CreateTreeModal';

const mockPush = jest.fn();
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockCreateTree = createTree as jest.MockedFunction<typeof createTree>;

/** テスト前のセットアップ */
function setupRouter() {
  mockUseRouter.mockReturnValue({
    push: mockPush,
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe('CreateTreeModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupRouter();
  });

  // ---------------------------------------------------------------------------
  // 表示制御
  // ---------------------------------------------------------------------------
  describe('表示制御', () => {
    it('isOpen=false の時はモーダルが描画されないこと', () => {
      const onClose = jest.fn();
      render(<CreateTreeModal isOpen={false} onClose={onClose} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('isOpen=true の時はタイトルフィールドが描画されること', () => {
      const onClose = jest.fn();
      render(<CreateTreeModal isOpen={true} onClose={onClose} />);

      expect(screen.getByLabelText(/タイトル/)).toBeInTheDocument();
    });

    it('isOpen=true の時は説明フィールドが描画されること', () => {
      const onClose = jest.fn();
      render(<CreateTreeModal isOpen={true} onClose={onClose} />);

      expect(screen.getByLabelText(/説明/)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // バリデーション
  // ---------------------------------------------------------------------------
  describe('クライアントサイドバリデーション', () => {
    it('タイトル空のまま submit → バリデーションエラーが表示され createTree が呼ばれないこと', async () => {
      const onClose = jest.fn();
      render(<CreateTreeModal isOpen={true} onClose={onClose} />);

      const submitButton = screen.getByRole('button', { name: '作成する' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('タイトルを入力してください')).toBeInTheDocument();
      });
      expect(mockCreateTree).not.toHaveBeenCalled();
    });

    it('タイトル101文字で submit → バリデーションエラーが表示され createTree が呼ばれないこと', async () => {
      const onClose = jest.fn();
      render(<CreateTreeModal isOpen={true} onClose={onClose} />);

      // maxLength 属性をバイパスするため fireEvent.change で直接値をセット
      const titleInput = screen.getByLabelText(/タイトル/);
      fireEvent.change(titleInput, { target: { value: 'あ'.repeat(101) } });

      const submitButton = screen.getByRole('button', { name: '作成する' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/100文字以内/)).toBeInTheDocument();
      });
      expect(mockCreateTree).not.toHaveBeenCalled();
    });

    it('説明501文字で submit → バリデーションエラーが表示され createTree が呼ばれないこと', async () => {
      const onClose = jest.fn();
      render(<CreateTreeModal isOpen={true} onClose={onClose} />);

      // タイトルは正常に入力
      const titleInput = screen.getByLabelText(/タイトル/);
      fireEvent.change(titleInput, { target: { value: 'テストツリー' } });

      // 説明に501文字を直接セット（maxLength をバイパス）
      const descriptionInput = screen.getByLabelText(/説明/);
      fireEvent.change(descriptionInput, { target: { value: 'あ'.repeat(501) } });

      const submitButton = screen.getByRole('button', { name: '作成する' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/500文字以内/)).toBeInTheDocument();
      });
      expect(mockCreateTree).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 正常な送信
  // ---------------------------------------------------------------------------
  describe('正常な送信', () => {
    it('タイトル入力して submit → createTree が呼ばれること', async () => {
      mockCreateTree.mockResolvedValue({ ok: true, data: { treeId: 'new-tree-id' } });
      const onClose = jest.fn();
      const user = userEvent.setup();

      render(<CreateTreeModal isOpen={true} onClose={onClose} />);

      await user.type(screen.getByLabelText(/タイトル/), 'テストツリー');
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        expect(mockCreateTree).toHaveBeenCalled();
      });
    });

    it('createTree 成功後、router.push("/trees/{treeId}") が呼ばれること', async () => {
      mockCreateTree.mockResolvedValue({ ok: true, data: { treeId: 'new-tree-id' } });
      const onClose = jest.fn();
      const user = userEvent.setup();

      render(<CreateTreeModal isOpen={true} onClose={onClose} />);

      await user.type(screen.getByLabelText(/タイトル/), 'テストツリー');
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/trees/new-tree-id');
      });
    });

    it('createTree 成功後、onClose が呼ばれること', async () => {
      mockCreateTree.mockResolvedValue({ ok: true, data: { treeId: 'new-tree-id' } });
      const onClose = jest.fn();
      const user = userEvent.setup();

      render(<CreateTreeModal isOpen={true} onClose={onClose} />);

      await user.type(screen.getByLabelText(/タイトル/), 'テストツリー');
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // エラーハンドリング
  // ---------------------------------------------------------------------------
  describe('エラーハンドリング', () => {
    it('PLAN_LIMIT_EXCEEDED の場合「上限に達しました」UIが表示されること', async () => {
      mockCreateTree.mockResolvedValue({
        ok: false,
        error: { code: 'PLAN_LIMIT_EXCEEDED', message: '上限に達しています' },
      });
      const onClose = jest.fn();
      const user = userEvent.setup();

      render(<CreateTreeModal isOpen={true} onClose={onClose} />);

      await user.type(screen.getByLabelText(/タイトル/), 'テストツリー');
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        expect(screen.getByText('上限に達しました')).toBeInTheDocument();
      });
    });

    it('field="title" のエラーが返った場合、タイトルフィールドエラーが表示されること', async () => {
      mockCreateTree.mockResolvedValue({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'タイトルが不正です', field: 'title' },
      });
      const onClose = jest.fn();
      const user = userEvent.setup();

      render(<CreateTreeModal isOpen={true} onClose={onClose} />);

      await user.type(screen.getByLabelText(/タイトル/), 'テストツリー');
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        expect(screen.getByText('タイトルが不正です')).toBeInTheDocument();
      });
    });

    it('field="description" のエラーが返った場合、説明フィールドエラーが表示されること', async () => {
      mockCreateTree.mockResolvedValue({
        ok: false,
        error: { field: 'description', message: '説明が不正です' },
      });
      const onClose = jest.fn();
      const user = userEvent.setup();

      render(<CreateTreeModal isOpen={true} onClose={onClose} />);

      await user.type(screen.getByLabelText(/タイトル/), 'テストツリー');
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        expect(screen.getByText('説明が不正です')).toBeInTheDocument();
      });
    });

    it('field 未指定のエラーが返った場合、root エラーが表示されること', async () => {
      mockCreateTree.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'サーバーエラーが発生しました' },
      });
      const onClose = jest.fn();
      const user = userEvent.setup();

      render(<CreateTreeModal isOpen={true} onClose={onClose} />);

      await user.type(screen.getByLabelText(/タイトル/), 'テストツリー');
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        expect(screen.getByText('サーバーエラーが発生しました')).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 送信中の状態
  // ---------------------------------------------------------------------------
  describe('送信中の状態', () => {
    it('送信中はキャンセルボタンが disabled になること', async () => {
      // 解決しない Promise で送信中状態を保持
      mockCreateTree.mockImplementation(() => new Promise(() => {}));
      const onClose = jest.fn();
      const user = userEvent.setup();

      render(<CreateTreeModal isOpen={true} onClose={onClose} />);

      await user.type(screen.getByLabelText(/タイトル/), 'テストツリー');
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
      });
    });

    it('送信中は submit ボタンが loading 状態（aria-disabled）になること', async () => {
      mockCreateTree.mockImplementation(() => new Promise(() => {}));
      const onClose = jest.fn();
      const user = userEvent.setup();

      render(<CreateTreeModal isOpen={true} onClose={onClose} />);

      await user.type(screen.getByLabelText(/タイトル/), 'テストツリー');
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: '作成する' });
        expect(submitButton).toHaveAttribute('aria-disabled', 'true');
      });
    });
  });
});
