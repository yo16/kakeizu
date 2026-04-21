/**
 * TreeCard コンポーネントのテスト
 *
 * タイトル・説明・人物数・更新日・リンクの表示を検証する。
 */

import { render, screen } from '@testing-library/react';
import { TreeCard } from '../TreeCard';
import { type TreeListItem } from '../../actions/list-trees';

// next/link をモック（jsdom では <a> タグとして動作）
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

/** ベーステストデータ */
const BASE_TREE: TreeListItem = {
  id: 'bbbbbbbb-0000-0000-0000-000000000001',
  title: '田中家の家系図',
  description: 'テスト用の説明文',
  personCount: 5,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('TreeCard', () => {
  // ---------------------------------------------------------------------------
  // タイトル表示
  // ---------------------------------------------------------------------------
  describe('タイトル表示', () => {
    it('タイトルが表示されること', () => {
      render(<TreeCard tree={BASE_TREE} />);

      expect(screen.getByText('田中家の家系図')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 説明表示
  // ---------------------------------------------------------------------------
  describe('説明表示', () => {
    it('description が存在する場合は表示されること', () => {
      render(<TreeCard tree={BASE_TREE} />);

      expect(screen.getByText('テスト用の説明文')).toBeInTheDocument();
    });

    it('description が null の場合は説明が描画されないこと', () => {
      const tree: TreeListItem = { ...BASE_TREE, description: null };
      render(<TreeCard tree={tree} />);

      expect(screen.queryByText('テスト用の説明文')).not.toBeInTheDocument();
      // <p class="description"> に相当する要素が存在しないことを確認
      // description は条件付きレンダリングなので、null時はpタグがない
      const descEl = document.querySelector('p');
      // タイトルはh2なのでpタグがなければdescriptionなし
      expect(descEl).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 人物数表示
  // ---------------------------------------------------------------------------
  describe('人物数表示', () => {
    it('人物数が表示されること', () => {
      render(<TreeCard tree={BASE_TREE} />);

      const personCountEl = screen.getByLabelText('人物数');
      expect(personCountEl).toHaveTextContent('5');
    });

    it('personCount が 0 の場合も表示されること', () => {
      const tree: TreeListItem = { ...BASE_TREE, personCount: 0 };
      render(<TreeCard tree={tree} />);

      const personCountEl = screen.getByLabelText('人物数');
      expect(personCountEl).toHaveTextContent('0');
    });
  });

  // ---------------------------------------------------------------------------
  // 更新日表示
  // ---------------------------------------------------------------------------
  describe('更新日表示', () => {
    it('更新日が ja-JP ロケールで表示されること', () => {
      const tree: TreeListItem = {
        ...BASE_TREE,
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      render(<TreeCard tree={tree} />);

      // ja-JP の toLocaleDateString は「2024年1月1日」形式になる
      const formatted = new Date('2024-01-01T00:00:00.000Z').toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      expect(screen.getByText(`更新日: ${formatted}`)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // リンク
  // ---------------------------------------------------------------------------
  describe('リンク', () => {
    it('カード全体が /trees/{id} へのリンクであること', () => {
      render(<TreeCard tree={BASE_TREE} />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', `/trees/${BASE_TREE.id}`);
    });

    it('タイトルテキストがリンク内に含まれること', () => {
      render(<TreeCard tree={BASE_TREE} />);

      const link = screen.getByRole('link');
      expect(link).toHaveTextContent('田中家の家系図');
    });
  });
});
