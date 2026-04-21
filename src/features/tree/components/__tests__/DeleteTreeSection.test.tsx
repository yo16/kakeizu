/**
 * DeleteTreeSection コンポーネントのテスト
 *
 * ボタン + モーダル一体管理の開閉制御と props 伝達を検証する。
 */

// next/navigation をモック（DeleteTreeModal 内で useRouter が使われる）
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// deleteTree アクションをモック
jest.mock('@/features/tree/actions/delete-tree', () => ({
  deleteTree: jest.fn(),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { DeleteTreeSection } from '../DeleteTreeSection';

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

/** useRouter のセットアップ */
function setupRouter() {
  mockUseRouter.mockReturnValue({
    push: jest.fn(),
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
  treeId: 'aaaaaaaa-0000-0000-0000-000000000001',
  treeTitle: '田中家の家系図',
  counts: {
    persons: 5,
    photos: 3,
  },
};

describe('DeleteTreeSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupRouter();
  });

  // ---------------------------------------------------------------------------
  // 初期表示
  // ---------------------------------------------------------------------------
  describe('初期表示', () => {
    it('危険ゾーンの説明テキストが表示されること', () => {
      render(<DeleteTreeSection {...DEFAULT_PROPS} />);

      expect(screen.getByText('この家系図を削除')).toBeInTheDocument();
    });

    it('「ツリーを削除」ボタンが表示されること', () => {
      render(<DeleteTreeSection {...DEFAULT_PROPS} />);

      expect(screen.getByRole('button', { name: 'ツリーを削除' })).toBeInTheDocument();
    });

    it('初期状態ではモーダルが閉じていること', () => {
      render(<DeleteTreeSection {...DEFAULT_PROPS} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // モーダル開閉
  // ---------------------------------------------------------------------------
  describe('モーダル開閉', () => {
    it('「ツリーを削除」クリックでモーダルが開くこと', () => {
      render(<DeleteTreeSection {...DEFAULT_PROPS} />);

      fireEvent.click(screen.getByRole('button', { name: 'ツリーを削除' }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('モーダル内でキャンセルボタンをクリックするとモーダルが閉じること', () => {
      render(<DeleteTreeSection {...DEFAULT_PROPS} />);

      fireEvent.click(screen.getByRole('button', { name: 'ツリーを削除' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('モーダルを閉じた後に再度「ツリーを削除」クリックでモーダルが再表示されること', () => {
      render(<DeleteTreeSection {...DEFAULT_PROPS} />);

      // 1回目: 開く
      fireEvent.click(screen.getByRole('button', { name: 'ツリーを削除' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // 閉じる
      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // 2回目: 再度開く
      fireEvent.click(screen.getByRole('button', { name: 'ツリーを削除' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // props 伝達
  // ---------------------------------------------------------------------------
  describe('props が DeleteTreeModal に正しく伝達されること', () => {
    it('treeTitle がモーダル内の確認ヒントに表示されること', () => {
      render(<DeleteTreeSection {...DEFAULT_PROPS} />);

      fireEvent.click(screen.getByRole('button', { name: 'ツリーを削除' }));

      // モーダル内で treeTitle が表示されている
      expect(screen.getByText('田中家の家系図')).toBeInTheDocument();
    });

    it('counts.persons がモーダル内に表示されること', () => {
      render(<DeleteTreeSection {...DEFAULT_PROPS} />);

      fireEvent.click(screen.getByRole('button', { name: 'ツリーを削除' }));

      expect(screen.getByText('5 名')).toBeInTheDocument();
    });

    it('counts.photos がモーダル内に表示されること', () => {
      render(<DeleteTreeSection {...DEFAULT_PROPS} />);

      fireEvent.click(screen.getByRole('button', { name: 'ツリーを削除' }));

      expect(screen.getByText('3 枚')).toBeInTheDocument();
    });

    it('異なる treeTitle を渡した場合にモーダル内に反映されること', () => {
      render(
        <DeleteTreeSection
          treeId="bbbbbbbb-0000-0000-0000-000000000002"
          treeTitle="山田家の家系図"
          counts={{ persons: 10, photos: 7 }}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'ツリーを削除' }));

      expect(screen.getByText('山田家の家系図')).toBeInTheDocument();
      expect(screen.getByText('10 名')).toBeInTheDocument();
      expect(screen.getByText('7 枚')).toBeInTheDocument();
    });
  });
});
