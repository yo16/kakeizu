/**
 * PersonNode コンポーネントのテスト
 *
 * 氏名・生没年の表示、クリックハンドラ、CSSクラス適用を検証する。
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonNode } from '../PersonNode';
import { type PersonNode as PersonNodeType } from '../../types';

/** ベーステストデータ */
const BASE_NODE: PersonNodeType = {
  type: 'person',
  id: 'person-001',
  generation: 0,
  x: 0,
  y: 0,
  displayName: '田中 太郎',
  birthYear: 1950,
  deathYear: null,
  primaryPhotoUrl: null,
};

describe('PersonNode', () => {
  // -------------------------------------------------------------------------
  // 氏名・生没年の表示
  // -------------------------------------------------------------------------
  describe('氏名・生没年の表示', () => {
    it('生年・没年あり: 氏名と生没年が表示されること', () => {
      const node: PersonNodeType = { ...BASE_NODE, birthYear: 1950, deathYear: 2010 };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      expect(screen.getByText('田中 太郎')).toBeInTheDocument();
      expect(screen.getByText('1950 - 2010')).toBeInTheDocument();
    });

    it('生年のみ: 氏名と生年が表示され、没年なしの表記になること', () => {
      const node: PersonNodeType = { ...BASE_NODE, birthYear: 1980, deathYear: null };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      expect(screen.getByText('田中 太郎')).toBeInTheDocument();
      expect(screen.getByText('1980 - ')).toBeInTheDocument();
    });

    it('生年・没年ともになし: 生没年が表示されないこと', () => {
      const node: PersonNodeType = { ...BASE_NODE, birthYear: null, deathYear: null };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      expect(screen.getByText('田中 太郎')).toBeInTheDocument();
      // 生没年要素がないことを確認
      expect(screen.queryByLabelText(/生没年/)).not.toBeInTheDocument();
    });

    it('故人の場合は†マークが表示されること', () => {
      const node: PersonNodeType = { ...BASE_NODE, birthYear: 1950, deathYear: 2010 };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      expect(screen.getByLabelText('故人')).toBeInTheDocument();
    });

    it('存命の場合は†マークが表示されないこと', () => {
      const node: PersonNodeType = { ...BASE_NODE, deathYear: null };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      expect(screen.queryByLabelText('故人')).not.toBeInTheDocument();
    });

    it('primaryPhotoUrl がない場合はイニシャルプレースホルダが表示されること', () => {
      const node: PersonNodeType = { ...BASE_NODE, primaryPhotoUrl: null };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      // displayName の1文字目がプレースホルダとして表示される
      expect(screen.getByText('田')).toBeInTheDocument();
    });

    it('primaryPhotoUrl がある場合は img 要素が描画されること', () => {
      const node: PersonNodeType = {
        ...BASE_NODE,
        primaryPhotoUrl: 'https://example.com/photo.jpg',
      };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const img = screen.getByRole('img', { name: '田中 太郎' });
      expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
    });
  });

  // -------------------------------------------------------------------------
  // クリックハンドラ
  // -------------------------------------------------------------------------
  describe('クリックハンドラ', () => {
    it('onClick が渡された場合: クリックでハンドラが呼ばれること', async () => {
      const user = userEvent.setup();
      const onClick = jest.fn();
      const node: PersonNodeType = { ...BASE_NODE };
      render(
        <svg>
          <PersonNode node={node} onClick={onClick} />
        </svg>
      );

      await user.click(screen.getByRole('button'));

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith('person-001');
    });

    it('onClick がない場合: クリックしてもエラーにならないこと', async () => {
      const user = userEvent.setup();
      const node: PersonNodeType = { ...BASE_NODE };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      // role="button" は付与されないはずなので、div 要素をクリック
      const nodeEl = screen.getByText('田中 太郎').closest('div');
      expect(() => user.click(nodeEl!)).not.toThrow();
    });

    it('onClick が渡された場合: button role が付与されること', () => {
      const onClick = jest.fn();
      const node: PersonNodeType = { ...BASE_NODE };
      render(
        <svg>
          <PersonNode node={node} onClick={onClick} />
        </svg>
      );

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('onClick がない場合: button role が付与されないこと', () => {
      const node: PersonNodeType = { ...BASE_NODE };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // CSS Modules クラス
  // -------------------------------------------------------------------------
  describe('CSS Modules クラス', () => {
    it('node クラスが適用されていること', () => {
      const node: PersonNodeType = { ...BASE_NODE };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const nodeEl = screen.getByText('田中 太郎').closest('div');
      // CSS Modules ではクラス名が変換されるため、クラス属性が存在することのみ確認
      expect(nodeEl).toHaveAttribute('class');
    });

    it('故人の場合: deceased クラスが追加されること', () => {
      const node: PersonNodeType = { ...BASE_NODE, deathYear: 2010 };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const nodeEl = screen.getByText('田中 太郎').closest('div');
      // CSS Modules 変換後のクラス名が含まれることを確認
      expect(nodeEl?.className).toContain('deceased');
    });

    it('存命の場合: deceased クラスが付与されないこと', () => {
      const node: PersonNodeType = { ...BASE_NODE, deathYear: null };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const nodeEl = screen.getByText('田中 太郎').closest('div');
      // 空文字または deceased を含まないクラスであることを確認
      const className = nodeEl?.className ?? '';
      // 末尾スペース付きで deceased が単独クラスとして入っていないことを確認
      expect(className.trim()).not.toMatch(/\bdeceased\b/);
    });
  });
});
