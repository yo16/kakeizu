/**
 * CreateTreeButton コンポーネントのテスト
 *
 * ボタンの初期状態・モーダル開閉・props の渡し方を検証する。
 */

// next/navigation をモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// createTree アクションをモック
jest.mock('@/features/tree/actions/create-tree', () => ({
  createTree: jest.fn(),
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { CreateTreeButton } from '../CreateTreeButton';

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

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

describe('CreateTreeButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupRouter();
  });

  // ---------------------------------------------------------------------------
  // 初期状態
  // ---------------------------------------------------------------------------
  describe('初期状態', () => {
    it('ボタンが表示されること', () => {
      render(<CreateTreeButton />);

      expect(screen.getByRole('button', { name: '新しい家系図を作成' })).toBeInTheDocument();
    });

    it('初期状態ではモーダルが閉じていること', () => {
      render(<CreateTreeButton />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // モーダル開閉
  // ---------------------------------------------------------------------------
  describe('モーダル開閉', () => {
    it('ボタンクリックでモーダルが開くこと', async () => {
      const user = userEvent.setup();
      render(<CreateTreeButton />);

      await user.click(screen.getByRole('button', { name: '新しい家系図を作成' }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('モーダル内のキャンセルボタンでモーダルが閉じること', async () => {
      const user = userEvent.setup();
      render(<CreateTreeButton />);

      // モーダルを開く
      await user.click(screen.getByRole('button', { name: '新しい家系図を作成' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // キャンセルでモーダルを閉じる
      await user.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('モーダルを閉じた後、再度ボタンクリックでモーダルが再表示されること', async () => {
      const user = userEvent.setup();
      render(<CreateTreeButton />);

      // 1回目: 開く → 閉じる
      await user.click(screen.getByRole('button', { name: '新しい家系図を作成' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // 2回目: 再度開く
      await user.click(screen.getByRole('button', { name: '新しい家系図を作成' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // props
  // ---------------------------------------------------------------------------
  describe('props', () => {
    it('label prop がボタンのアクセシブルネームに反映されること', () => {
      render(<CreateTreeButton label="最初の家系図を作成する" />);

      expect(
        screen.getByRole('button', { name: '最初の家系図を作成する' })
      ).toBeInTheDocument();
    });

    it('デフォルト label が「新しい家系図を作成」であること', () => {
      render(<CreateTreeButton />);

      expect(
        screen.getByRole('button', { name: '新しい家系図を作成' })
      ).toBeInTheDocument();
    });

    it('size="lg" prop が渡された場合、ボタンが存在すること', () => {
      render(<CreateTreeButton size="lg" />);

      // サイズクラスは実装依存なので、ボタンが描画されることのみ確認
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('variant="secondary" prop が渡された場合、ボタンが存在すること', () => {
      render(<CreateTreeButton variant="secondary" />);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });
});
