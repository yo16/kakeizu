/**
 * DeleteTreeModal コンポーネントのテスト
 *
 * タイトル完全一致確認・deleteTree 呼び出し・リダイレクト・エラーハンドリングを検証する。
 */

// next/navigation をモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// deleteTree アクションをモック
jest.mock('@/features/tree/actions/delete-tree', () => ({
  deleteTree: jest.fn(),
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { deleteTree } from '@/features/tree/actions/delete-tree';
import { DeleteTreeModal } from '../DeleteTreeModal';

const mockPush = jest.fn();
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockDeleteTree = deleteTree as jest.MockedFunction<typeof deleteTree>;

/** useRouter のセットアップ */
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

/** テスト用デフォルト Props */
const DEFAULT_PROPS = {
  isOpen: true,
  onClose: jest.fn(),
  treeId: 'aaaaaaaa-0000-0000-0000-000000000001',
  treeTitle: '田中家の家系図',
  counts: {
    persons: 5,
    photos: 3,
  },
};

describe('DeleteTreeModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupRouter();
  });

  // ---------------------------------------------------------------------------
  // 初期表示
  // ---------------------------------------------------------------------------
  describe('初期表示', () => {
    it('isOpen=false のときモーダルは表示されないこと', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('isOpen=true のとき「家系図を削除」タイトルが表示されること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '家系図を削除' })).toBeInTheDocument();
    });

    it('counts.persons 名が表示されること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      expect(screen.getByText('5 名')).toBeInTheDocument();
    });

    it('counts.photos 枚が表示されること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      expect(screen.getByText('3 枚')).toBeInTheDocument();
    });

    it('カスケード削除箇条書き「人物情報」が表示されること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      expect(screen.getByText(/人物情報/)).toBeInTheDocument();
    });

    it('カスケード削除箇条書き「親子・婚姻などの関係情報」が表示されること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      expect(screen.getByText(/親子・婚姻などの関係情報/)).toBeInTheDocument();
    });

    it('カスケード削除箇条書き「写真ファイル」が表示されること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      expect(screen.getByText(/写真ファイル/)).toBeInTheDocument();
    });

    it('カスケード削除箇条書き「共有リンク」が表示されること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      expect(screen.getByText(/共有リンク/)).toBeInTheDocument();
    });

    it('「この操作は取り消せません」が表示されること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      expect(screen.getByText('この操作は取り消せません。')).toBeInTheDocument();
    });

    it('treeTitle が確認ヒントに表示されること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      expect(screen.getByText('田中家の家系図')).toBeInTheDocument();
    });

    it('削除ボタンが初期状態で disabled であること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      expect(screen.getByRole('button', { name: '削除する' })).toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // タイトル確認入力
  // ---------------------------------------------------------------------------
  describe('タイトル確認入力', () => {
    it('不一致タイトルを入力しても削除ボタンが disabled のままであること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      const input = screen.getByRole('textbox', { name: /ツリーのタイトルを入力/ });
      fireEvent.change(input, { target: { value: '別の家系図' } });

      expect(screen.getByRole('button', { name: '削除する' })).toBeDisabled();
    });

    it('完全一致タイトルを入力すると削除ボタンが enabled になること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      const input = screen.getByRole('textbox', { name: /ツリーのタイトルを入力/ });
      fireEvent.change(input, { target: { value: '田中家の家系図' } });

      expect(screen.getByRole('button', { name: '削除する' })).not.toBeDisabled();
    });

    it('前後に空白を含む一致タイトルで trim() により削除ボタンが enabled になること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      // treeTitle が '田中家の家系図' で confirmValue が '  田中家の家系図  ' の場合、
      // trim() 後に一致するため enabled になる
      const input = screen.getByRole('textbox', { name: /ツリーのタイトルを入力/ });
      fireEvent.change(input, { target: { value: '  田中家の家系図  ' } });

      expect(screen.getByRole('button', { name: '削除する' })).not.toBeDisabled();
    });

    it('タイトルが空文字の場合は削除ボタンが disabled であること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      // 何も入力しない状態
      const input = screen.getByRole('textbox', { name: /ツリーのタイトルを入力/ });
      expect(input).toHaveValue('');
      expect(screen.getByRole('button', { name: '削除する' })).toBeDisabled();
    });

    it('タイトルが全て空白の場合は削除ボタンが disabled であること', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      const input = screen.getByRole('textbox', { name: /ツリーのタイトルを入力/ });
      fireEvent.change(input, { target: { value: '   ' } });

      expect(screen.getByRole('button', { name: '削除する' })).toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // 送信
  // ---------------------------------------------------------------------------
  describe('送信', () => {
    it('完全一致で submit すると deleteTree({ treeId }) が呼ばれること', async () => {
      mockDeleteTree.mockResolvedValue({ ok: true, data: undefined });
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      const input = screen.getByRole('textbox', { name: /ツリーのタイトルを入力/ });
      fireEvent.change(input, { target: { value: '田中家の家系図' } });
      fireEvent.click(screen.getByRole('button', { name: '削除する' }));

      await waitFor(() => {
        expect(mockDeleteTree).toHaveBeenCalledWith({
          treeId: 'aaaaaaaa-0000-0000-0000-000000000001',
        });
      });
    });

    it('deleteTree が { ok: true } → onClose が呼ばれること', async () => {
      mockDeleteTree.mockResolvedValue({ ok: true, data: undefined });
      const onClose = jest.fn();
      render(<DeleteTreeModal {...DEFAULT_PROPS} onClose={onClose} />);

      const input = screen.getByRole('textbox', { name: /ツリーのタイトルを入力/ });
      fireEvent.change(input, { target: { value: '田中家の家系図' } });
      fireEvent.click(screen.getByRole('button', { name: '削除する' }));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('deleteTree が { ok: true } → router.push("/dashboard") が呼ばれること', async () => {
      mockDeleteTree.mockResolvedValue({ ok: true, data: undefined });
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      const input = screen.getByRole('textbox', { name: /ツリーのタイトルを入力/ });
      fireEvent.change(input, { target: { value: '田中家の家系図' } });
      fireEvent.click(screen.getByRole('button', { name: '削除する' }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      });
    });

    it('disabled 状態で submit を発火しても deleteTree が呼ばれないこと', () => {
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      // タイトルを入力せず（disabled 状態のまま）フォームを submit しようとする
      // disabled な button は userEvent.click で反応しないが、
      // フォーム submit イベントを直接確認するため button の disabled を検証
      const submitButton = screen.getByRole('button', { name: '削除する' });
      expect(submitButton).toBeDisabled();

      fireEvent.click(submitButton);

      expect(mockDeleteTree).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // エラーハンドリング
  // ---------------------------------------------------------------------------
  describe('エラーハンドリング', () => {
    it('deleteTree が { ok: false } → root エラーが表示され router.push されないこと', async () => {
      mockDeleteTree.mockResolvedValue({
        ok: false,
        error: { message: '削除に失敗' },
      });
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      const input = screen.getByRole('textbox', { name: /ツリーのタイトルを入力/ });
      fireEvent.change(input, { target: { value: '田中家の家系図' } });
      fireEvent.click(screen.getByRole('button', { name: '削除する' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('削除に失敗');
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('deleteTree が例外 throw → 「ツリーの削除に失敗しました。もう一度お試しください。」が表示されること', async () => {
      mockDeleteTree.mockRejectedValue(new Error('Network error'));
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      const input = screen.getByRole('textbox', { name: /ツリーのタイトルを入力/ });
      fireEvent.change(input, { target: { value: '田中家の家系図' } });
      fireEvent.click(screen.getByRole('button', { name: '削除する' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'ツリーの削除に失敗しました。もう一度お試しください。'
        );
      });
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 送信中の状態
  // ---------------------------------------------------------------------------
  describe('送信中の状態', () => {
    it('送信中はキャンセルボタンが disabled になること', async () => {
      // 解決しない Promise で送信中状態を保持
      mockDeleteTree.mockImplementation(() => new Promise(() => {}));
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      const input = screen.getByRole('textbox', { name: /ツリーのタイトルを入力/ });
      fireEvent.change(input, { target: { value: '田中家の家系図' } });
      fireEvent.click(screen.getByRole('button', { name: '削除する' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
      });
    });

    it('送信中は削除ボタンが loading 状態（aria-disabled）になること', async () => {
      mockDeleteTree.mockImplementation(() => new Promise(() => {}));
      render(<DeleteTreeModal {...DEFAULT_PROPS} />);

      const input = screen.getByRole('textbox', { name: /ツリーのタイトルを入力/ });
      fireEvent.change(input, { target: { value: '田中家の家系図' } });
      fireEvent.click(screen.getByRole('button', { name: '削除する' }));

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: '削除する' });
        expect(submitButton).toHaveAttribute('aria-disabled', 'true');
      });
    });

    it('送信中に onClose を呼ぼうとしても handleClose ガードにより無視されること', async () => {
      mockDeleteTree.mockImplementation(() => new Promise(() => {}));
      const onClose = jest.fn();
      render(<DeleteTreeModal {...DEFAULT_PROPS} onClose={onClose} />);

      const input = screen.getByRole('textbox', { name: /ツリーのタイトルを入力/ });
      fireEvent.change(input, { target: { value: '田中家の家系図' } });
      fireEvent.click(screen.getByRole('button', { name: '削除する' }));

      // 送信中状態になるまで待機
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
      });

      // キャンセルボタンは disabled のため fireEvent.click しても onClose は呼ばれない
      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

      // onClose が呼ばれていないことを確認
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
