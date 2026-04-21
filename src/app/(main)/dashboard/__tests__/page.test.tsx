/**
 * ダッシュボードページの統合テスト
 *
 * listTrees の結果に応じた空状態UI・ツリーカード一覧表示を検証する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// listTrees をモック
jest.mock('@/features/tree/actions/list-trees', () => ({
  listTrees: jest.fn(),
}));

// CreateTreeButton をモック（Client Component - モーダルの詳細は別テストで担保）
jest.mock('@/features/tree/components/CreateTreeButton', () => ({
  CreateTreeButton: function MockCreateTreeButton({ label }: { label?: string }) {
    return <button type="button">{label ?? '新しい家系図を作成'}</button>;
  },
}));

// next/link をモック
jest.mock('next/link', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function MockLink({ href, children, className }: any) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  };
});

import { render, screen } from '@testing-library/react';
import { listTrees } from '@/features/tree/actions/list-trees';
import DashboardPage from '../page';

const mockListTrees = listTrees as jest.MockedFunction<typeof listTrees>;

/** テスト用ツリーデータ */
const TREE_1 = {
  id: 'bbbbbbbb-0000-0000-0000-000000000001',
  title: '田中家の家系図',
  description: '田中家の記録',
  personCount: 3,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const TREE_2 = {
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  title: '鈴木家の家系図',
  description: null,
  personCount: 0,
  createdAt: '2024-01-02T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
};

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 空状態UI
  // ---------------------------------------------------------------------------
  describe('空状態UI', () => {
    it('listTrees が空配列を返す場合、空状態UIが描画されること', async () => {
      mockListTrees.mockResolvedValue({ ok: true, data: [] });

      render(await DashboardPage());

      expect(screen.getByText('家系図がまだありません')).toBeInTheDocument();
    });

    it('空状態UI に説明文が表示されること', async () => {
      mockListTrees.mockResolvedValue({ ok: true, data: [] });

      render(await DashboardPage());

      expect(
        screen.getByText('最初の家系図を作成しましょう。先祖や家族の記録をかんたんにまとめられます。')
      ).toBeInTheDocument();
    });

    it('空状態UI に「最初の家系図を作成する」ボタンが表示されること', async () => {
      mockListTrees.mockResolvedValue({ ok: true, data: [] });

      render(await DashboardPage());

      expect(screen.getByRole('button', { name: '最初の家系図を作成する' })).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // ツリー一覧表示
  // ---------------------------------------------------------------------------
  describe('ツリー一覧表示', () => {
    it('listTrees が複数ツリーを返す場合、TreeCard が人数分描画されること', async () => {
      mockListTrees.mockResolvedValue({ ok: true, data: [TREE_1, TREE_2] });

      render(await DashboardPage());

      expect(screen.getByText('田中家の家系図')).toBeInTheDocument();
      expect(screen.getByText('鈴木家の家系図')).toBeInTheDocument();
    });

    it('ツリーが1件の場合、TreeCard が1つ描画されること', async () => {
      mockListTrees.mockResolvedValue({ ok: true, data: [TREE_1] });

      render(await DashboardPage());

      expect(screen.getAllByRole('link')).toHaveLength(1);
    });

    it('ツリー一覧表示の時に空状態UIが表示されないこと', async () => {
      mockListTrees.mockResolvedValue({ ok: true, data: [TREE_1] });

      render(await DashboardPage());

      expect(screen.queryByText('家系図がまだありません')).not.toBeInTheDocument();
    });

    it('各 TreeCard が /trees/{treeId} へのリンクになること', async () => {
      mockListTrees.mockResolvedValue({ ok: true, data: [TREE_1, TREE_2] });

      render(await DashboardPage());

      const links = screen.getAllByRole('link');
      const hrefs = links.map((link) => link.getAttribute('href'));
      expect(hrefs).toContain(`/trees/${TREE_1.id}`);
      expect(hrefs).toContain(`/trees/${TREE_2.id}`);
    });
  });

  // ---------------------------------------------------------------------------
  // エラー時の動作
  // ---------------------------------------------------------------------------
  describe('エラー時の動作', () => {
    it('listTrees が { ok: false } を返す場合でも空状態UIが描画されること（例外にならないこと）', async () => {
      mockListTrees.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'エラー' },
      });

      let renderFn: (() => void) | null = null;
      expect(() => {
        renderFn = async () => render(await DashboardPage());
      }).not.toThrow();

      if (renderFn) {
        await renderFn();
        expect(screen.getByText('家系図がまだありません')).toBeInTheDocument();
      }
    });

    it('listTrees が { ok: false } を返す場合、trees=[] として空状態UIが描画されること', async () => {
      mockListTrees.mockResolvedValue({
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
      });

      render(await DashboardPage());

      expect(screen.getByText('家系図がまだありません')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // ページ共通要素
  // ---------------------------------------------------------------------------
  describe('ページ共通要素', () => {
    it('ページヘッダーに「あなたの家系図」が表示されること', async () => {
      mockListTrees.mockResolvedValue({ ok: true, data: [] });

      render(await DashboardPage());

      expect(screen.getByRole('heading', { name: 'あなたの家系図' })).toBeInTheDocument();
    });

    it('ヘッダーに「新しい家系図を作成」ボタンが表示されること', async () => {
      mockListTrees.mockResolvedValue({ ok: true, data: [TREE_1] });

      render(await DashboardPage());

      expect(screen.getByRole('button', { name: '新しい家系図を作成' })).toBeInTheDocument();
    });
  });
});
