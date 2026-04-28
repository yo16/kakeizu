/**
 * TreeSettingsPage 統合テスト
 *
 * getTreeOverview の結果に応じた基本情報表示・notFound() 呼び出しを検証する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// getTreeOverview をモック
jest.mock('@/features/tree/actions/get-tree-overview', () => ({
  getTreeOverview: jest.fn(),
}));

// getShareLink をモック
jest.mock('@/features/share/actions/get-share-link', () => ({
  getShareLink: jest.fn(),
}));

// TreeSettingsForm をモック（Client Component のフォーム詳細は別テストで担保）
jest.mock('@/features/tree/components/TreeSettingsForm', () => ({
  TreeSettingsForm: function MockTreeSettingsForm({
    treeId,
    defaultValues,
  }: {
    treeId: string;
    defaultValues: { title: string; description: string | null };
  }) {
    return (
      <div data-testid="tree-settings-form">
        <input
          readOnly
          aria-label="タイトル"
          defaultValue={defaultValues.title}
        />
        <textarea
          readOnly
          aria-label="説明"
          defaultValue={defaultValues.description ?? ''}
        />
        <span data-testid="tree-id">{treeId}</span>
      </div>
    );
  },
}));

// ShareLinkPanel をモック（Client Component の詳細は別テストで担保）
jest.mock('@/features/share/components', () => ({
  ShareLinkPanel: function MockShareLinkPanel({
    treeId,
    initialLink,
  }: {
    treeId: string;
    initialLink: unknown;
  }) {
    return (
      <div data-testid="share-link-panel">
        <span data-testid="share-link-panel-tree-id">{treeId}</span>
        <span data-testid="share-link-panel-initial-link">
          {initialLink === null ? 'null' : 'link'}
        </span>
      </div>
    );
  },
}));

// DeleteTreeSection をモック（Client Component の詳細は別テストで担保）
jest.mock('@/features/tree/components/DeleteTreeSection', () => ({
  DeleteTreeSection: function MockDeleteTreeSection({
    treeId,
    treeTitle,
    counts,
  }: {
    treeId: string;
    treeTitle: string;
    counts: { persons: number; photos: number };
  }) {
    return (
      <div data-testid="delete-tree-section">
        <span data-testid="delete-tree-id">{treeId}</span>
        <span data-testid="delete-tree-title">{treeTitle}</span>
        <span data-testid="delete-tree-persons">{counts.persons}</span>
        <span data-testid="delete-tree-photos">{counts.photos}</span>
      </div>
    );
  },
}));

// next/navigation の notFound をモック
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

import { render, screen } from '@testing-library/react';
import { notFound } from 'next/navigation';
import { getTreeOverview } from '@/features/tree/actions/get-tree-overview';
import { getShareLink } from '@/features/share/actions/get-share-link';
import TreeSettingsPage from '../page';

const mockGetTreeOverview = getTreeOverview as jest.MockedFunction<typeof getTreeOverview>;
const mockGetShareLink = getShareLink as jest.MockedFunction<typeof getShareLink>;
const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;

/** テスト用ツリーデータ */
const TREE_DATA = {
  tree: {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    title: '田中家の家系図',
    description: '田中家の記録',
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
  },
  counts: {
    persons: 5,
    photos: 3,
  },
};

/** ページをレンダリングするヘルパー */
async function renderPage(treeId = 'aaaaaaaa-0000-0000-0000-000000000001') {
  const params = Promise.resolve({ treeId });
  const page = await TreeSettingsPage({ params });
  return render(page);
}

describe('TreeSettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // getShareLink はデフォルトで null (未発行) を返す
    mockGetShareLink.mockResolvedValue({ ok: true, data: null });
  });

  // ---------------------------------------------------------------------------
  // 正常表示
  // ---------------------------------------------------------------------------
  describe('正常表示（getTreeOverview が成功する場合）', () => {
    beforeEach(() => {
      mockGetTreeOverview.mockResolvedValue({ ok: true, data: TREE_DATA });
    });

    it('見出し「ツリー設定」が表示されること', async () => {
      await renderPage();

      expect(screen.getByRole('heading', { name: 'ツリー設定', level: 1 })).toBeInTheDocument();
    });

    it('作成日が表示されること', async () => {
      await renderPage();

      // toLocaleDateString('ja-JP') の出力: 2024年1月15日
      expect(screen.getByText('2024年1月15日')).toBeInTheDocument();
    });

    it('人物数（N 人）が表示されること', async () => {
      await renderPage();

      expect(screen.getByText('5 人')).toBeInTheDocument();
    });

    it('写真数（N 枚）が表示されること', async () => {
      await renderPage();

      expect(screen.getByText('3 枚')).toBeInTheDocument();
    });

    it('ツリーのタイトルが TreeSettingsForm に渡されること', async () => {
      await renderPage();

      const titleInput = screen.getByRole('textbox', { name: 'タイトル' });
      expect(titleInput).toHaveValue('田中家の家系図');
    });

    it('ツリーの説明が TreeSettingsForm に渡されること', async () => {
      await renderPage();

      const descriptionInput = screen.getByRole('textbox', { name: '説明' });
      expect(descriptionInput).toHaveValue('田中家の記録');
    });

    it('treeId が TreeSettingsForm に渡されること', async () => {
      await renderPage('aaaaaaaa-0000-0000-0000-000000000001');

      expect(screen.getByTestId('tree-id')).toHaveTextContent(
        'aaaaaaaa-0000-0000-0000-000000000001'
      );
    });

    it('counts.persons が 0 人の場合も正しく表示されること', async () => {
      mockGetTreeOverview.mockResolvedValue({
        ok: true,
        data: {
          ...TREE_DATA,
          counts: { persons: 0, photos: 0 },
        },
      });

      await renderPage();

      expect(screen.getByText('0 人')).toBeInTheDocument();
      expect(screen.getByText('0 枚')).toBeInTheDocument();
    });

    it('description が null のツリーでも正常表示されること', async () => {
      mockGetTreeOverview.mockResolvedValue({
        ok: true,
        data: {
          ...TREE_DATA,
          tree: { ...TREE_DATA.tree, description: null },
        },
      });

      await renderPage();

      const descriptionInput = screen.getByRole('textbox', { name: '説明' });
      expect(descriptionInput).toHaveValue('');
    });

    it('危険ゾーンセクションが表示されること', async () => {
      await renderPage();

      expect(screen.getByRole('region', { name: '危険ゾーン' })).toBeInTheDocument();
    });

    it('DeleteTreeSection が表示されること', async () => {
      await renderPage();

      expect(screen.getByTestId('delete-tree-section')).toBeInTheDocument();
    });

    it('treeId が DeleteTreeSection に渡されること', async () => {
      await renderPage('aaaaaaaa-0000-0000-0000-000000000001');

      expect(screen.getByTestId('delete-tree-id')).toHaveTextContent(
        'aaaaaaaa-0000-0000-0000-000000000001'
      );
    });

    it('treeTitle が DeleteTreeSection に渡されること', async () => {
      await renderPage();

      expect(screen.getByTestId('delete-tree-title')).toHaveTextContent('田中家の家系図');
    });

    it('counts.persons が DeleteTreeSection に渡されること', async () => {
      await renderPage();

      expect(screen.getByTestId('delete-tree-persons')).toHaveTextContent('5');
    });

    it('counts.photos が DeleteTreeSection に渡されること', async () => {
      await renderPage();

      expect(screen.getByTestId('delete-tree-photos')).toHaveTextContent('3');
    });
  });

  // ---------------------------------------------------------------------------
  // ShareLinkPanel への props 渡し
  // ---------------------------------------------------------------------------
  describe('ShareLinkPanel への props 渡し', () => {
    it('getShareLink が null を返す場合 initialLink=null で ShareLinkPanel が表示されること', async () => {
      mockGetTreeOverview.mockResolvedValue({ ok: true, data: TREE_DATA });
      mockGetShareLink.mockResolvedValue({ ok: true, data: null });

      await renderPage();

      expect(screen.getByTestId('share-link-panel')).toBeInTheDocument();
      expect(screen.getByTestId('share-link-panel-initial-link')).toHaveTextContent('null');
    });

    it('getShareLink が ShareLink を返す場合 initialLink=link で ShareLinkPanel が表示されること', async () => {
      const shareLink = {
        id: 'aaaaaaaa-0000-0000-0000-000000000001',
        treeId: TREE_DATA.tree.id,
        token: 'TESTTOKEN',
        isEnabled: true,
        createdAt: '2026-04-27T00:00:00.000Z',
      };
      mockGetTreeOverview.mockResolvedValue({ ok: true, data: TREE_DATA });
      mockGetShareLink.mockResolvedValue({ ok: true, data: shareLink });

      await renderPage();

      expect(screen.getByTestId('share-link-panel-initial-link')).toHaveTextContent('link');
    });

    it('treeId が ShareLinkPanel に渡されること', async () => {
      mockGetTreeOverview.mockResolvedValue({ ok: true, data: TREE_DATA });

      await renderPage('aaaaaaaa-0000-0000-0000-000000000001');

      expect(screen.getByTestId('share-link-panel-tree-id')).toHaveTextContent(
        'aaaaaaaa-0000-0000-0000-000000000001'
      );
    });

    it('getShareLink が失敗した場合でも initialLink=null で ShareLinkPanel が表示されること', async () => {
      mockGetTreeOverview.mockResolvedValue({ ok: true, data: TREE_DATA });
      mockGetShareLink.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'エラー' },
      });

      await renderPage();

      expect(screen.getByTestId('share-link-panel-initial-link')).toHaveTextContent('null');
    });

    it('getShareLink が treeId を引数に呼ばれること', async () => {
      mockGetTreeOverview.mockResolvedValue({ ok: true, data: TREE_DATA });

      await renderPage('aaaaaaaa-0000-0000-0000-000000000001');

      expect(mockGetShareLink).toHaveBeenCalledWith({ treeId: 'aaaaaaaa-0000-0000-0000-000000000001' });
    });
  });

  // ---------------------------------------------------------------------------
  // notFound() 呼び出し
  // ---------------------------------------------------------------------------
  describe('notFound() 呼び出し（getTreeOverview が失敗する場合）', () => {
    it('getTreeOverview が { ok: false } を返す場合、notFound() が呼ばれること', async () => {
      mockGetTreeOverview.mockResolvedValue({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'ツリーが見つかりません' },
      });

      await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mockNotFound).toHaveBeenCalled();
    });

    it('getTreeOverview が UNAUTHENTICATED エラーを返す場合、notFound() が呼ばれること', async () => {
      mockGetTreeOverview.mockResolvedValue({
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
      });

      await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mockNotFound).toHaveBeenCalled();
    });
  });
});
