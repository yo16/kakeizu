/**
 * PersonNode コンポーネントのテスト
 *
 * 氏名・生没年の表示、クリックハンドラ、CSSクラス適用を検証する。
 * kakeizu-rgs.1 の差分: currentYear に応じた faded クラス適用ロジックを追加。
 * kakeizu-rgs.2 の差分: photos と currentYear に応じた年連動写真切替を追加。
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonNode } from '../PersonNode';
import { type PersonNode as PersonNodeType } from '../../types';
import { useTreeEditorStore } from '../../state/tree-editor-store';

/** 現在年 */
const CURRENT_YEAR = new Date().getFullYear();

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
      // formatLifespan(1980, null) は "1980 - " (末尾スペースあり) を返すため
      // exact: false で部分一致検索する
      expect(screen.getByText('1980 -', { exact: false })).toBeInTheDocument();
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

      // img の親 div に aria-hidden="true" があるため hidden: true を指定して取得する
      const img = screen.getByRole('img', { name: '田中 太郎', hidden: true });
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
  // isSelected prop のハイライト対応
  // -------------------------------------------------------------------------
  describe('isSelected prop', () => {
    it('isSelected=true で selected クラスが付与されること', () => {
      const node: PersonNodeType = { ...BASE_NODE };
      render(
        <svg>
          <PersonNode node={node} isSelected={true} />
        </svg>
      );

      const nodeEl = screen.getByText('田中 太郎').closest('[class*="node"]');
      expect(nodeEl?.className ?? '').toContain('selected');
    });

    it('isSelected=false で selected クラスが付与されないこと', () => {
      const node: PersonNodeType = { ...BASE_NODE };
      render(
        <svg>
          <PersonNode node={node} isSelected={false} />
        </svg>
      );

      const nodeEl = screen.getByText('田中 太郎').closest('[class*="node"]');
      expect(nodeEl?.className ?? '').not.toContain('selected');
    });

    it('isSelected 未指定で selected クラスが付与されないこと', () => {
      const node: PersonNodeType = { ...BASE_NODE };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const nodeEl = screen.getByText('田中 太郎').closest('[class*="node"]');
      expect(nodeEl?.className ?? '').not.toContain('selected');
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

      // DOM構造: <div class="node deceased"> > <div class="info"> > <span>田中 太郎</span>
      // closest('div') は info div を返すため、外側の node div を取得するために
      // [class*="node"] セレクタで外側 div を取得する
      const nodeEl = screen.getByText('田中 太郎').closest('[class*="node"]');
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

      // DOM構造: <div class="node"> > <div class="info"> > <span>田中 太郎</span>
      // 外側の node div を取得して deceased クラスがないことを確認する
      const nodeEl = screen.getByText('田中 太郎').closest('[class*="node"]');
      // 空文字または deceased を含まないクラスであることを確認
      const className = nodeEl?.className ?? '';
      // 末尾スペース付きで deceased が単独クラスとして入っていないことを確認
      expect(className.trim()).not.toMatch(/\bdeceased\b/);
    });
  });

  // -------------------------------------------------------------------------
  // タイムライン連動: currentYear に応じた faded クラス (kakeizu-rgs.1)
  // -------------------------------------------------------------------------
  describe('タイムライン連動 (faded クラス)', () => {
    /** store を指定した currentYear にセットする（render の前に呼ぶため act 不要）*/
    function setCurrentYear(year: number | null) {
      useTreeEditorStore.setState({ currentYear: year });
    }

    afterEach(() => {
      // テストごとに store をリセット（render なし状態なので act 不要）
      useTreeEditorStore.setState({ currentYear: null });
    });

    it('currentYear が null の場合は faded クラスが付かないこと', () => {
      setCurrentYear(null);
      const node: PersonNodeType = { ...BASE_NODE, birthYear: 1950, deathYear: 2000 };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const nodeEl = screen.getByText('田中 太郎').closest('[class*="node"]');
      expect(nodeEl?.className ?? '').not.toContain('faded');
    });

    it('currentYear が birthYear 未満の場合は faded クラスが付くこと', () => {
      setCurrentYear(1949);
      const node: PersonNodeType = { ...BASE_NODE, birthYear: 1950, deathYear: null };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const nodeEl = screen.getByText('田中 太郎').closest('[class*="node"]');
      expect(nodeEl?.className ?? '').toContain('faded');
    });

    it('currentYear が deathYear より大きい場合は faded クラスが付くこと', () => {
      setCurrentYear(2001);
      const node: PersonNodeType = { ...BASE_NODE, birthYear: 1950, deathYear: 2000 };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const nodeEl = screen.getByText('田中 太郎').closest('[class*="node"]');
      expect(nodeEl?.className ?? '').toContain('faded');
    });

    it('currentYear が birthYear〜deathYear の範囲内の場合は faded クラスが付かないこと', () => {
      setCurrentYear(1975);
      const node: PersonNodeType = { ...BASE_NODE, birthYear: 1950, deathYear: 2000 };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const nodeEl = screen.getByText('田中 太郎').closest('[class*="node"]');
      expect(nodeEl?.className ?? '').not.toContain('faded');
    });

    it('currentYear が birthYear と等しい場合は faded クラスが付かないこと (境界値)', () => {
      setCurrentYear(1950);
      const node: PersonNodeType = { ...BASE_NODE, birthYear: 1950, deathYear: 2000 };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const nodeEl = screen.getByText('田中 太郎').closest('[class*="node"]');
      expect(nodeEl?.className ?? '').not.toContain('faded');
    });

    it('currentYear が deathYear と等しい場合は faded クラスが付かないこと (境界値)', () => {
      setCurrentYear(2000);
      const node: PersonNodeType = { ...BASE_NODE, birthYear: 1950, deathYear: 2000 };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const nodeEl = screen.getByText('田中 太郎').closest('[class*="node"]');
      expect(nodeEl?.className ?? '').not.toContain('faded');
    });

    it('birthYear が null の場合: currentYear が設定されていても faded クラスが付かないこと', () => {
      setCurrentYear(1800);
      const node: PersonNodeType = { ...BASE_NODE, birthYear: null, deathYear: 2000 };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      // birthYear が null の場合は生年による非アクティブ判定をしない
      const nodeEl = screen.getByText('田中 太郎').closest('[class*="node"]');
      expect(nodeEl?.className ?? '').not.toContain('faded');
    });

    it('deathYear が null (存命) の場合: currentYear が設定されていても没年による faded は付かないこと', () => {
      setCurrentYear(CURRENT_YEAR + 100);
      const node: PersonNodeType = { ...BASE_NODE, birthYear: 1950, deathYear: null };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      // deathYear が null の場合は没年による非アクティブ判定をしない
      const nodeEl = screen.getByText('田中 太郎').closest('[class*="node"]');
      expect(nodeEl?.className ?? '').not.toContain('faded');
    });

    it('birthYear・deathYear ともに null の場合: faded クラスが付かないこと', () => {
      setCurrentYear(1500);
      const node: PersonNodeType = { ...BASE_NODE, birthYear: null, deathYear: null };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const nodeEl = screen.getByText('田中 太郎').closest('[class*="node"]');
      expect(nodeEl?.className ?? '').not.toContain('faded');
    });
  });

  // -------------------------------------------------------------------------
  // 年連動写真切替 (kakeizu-rgs.2)
  // -------------------------------------------------------------------------
  describe('年連動写真切替 (kakeizu-rgs.2)', () => {
    /** store を指定した currentYear にセットする */
    function setCurrentYear(year: number | null) {
      useTreeEditorStore.setState({ currentYear: year });
    }

    afterEach(() => {
      useTreeEditorStore.setState({ currentYear: null });
    });

    it('photos なし + currentYear あり: primaryPhotoUrl が img src に設定されること', () => {
      setCurrentYear(1980);
      const node: PersonNodeType = {
        ...BASE_NODE,
        primaryPhotoUrl: 'https://example.com/primary.jpg',
        photos: undefined,
      };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const img = screen.getByRole('img', { name: '田中 太郎', hidden: true });
      expect(img).toHaveAttribute('src', 'https://example.com/primary.jpg');
    });

    it('photos なし + primaryPhotoUrl なし + currentYear あり: イニシャルプレースホルダが表示されること', () => {
      setCurrentYear(1980);
      const node: PersonNodeType = {
        ...BASE_NODE,
        primaryPhotoUrl: null,
        photos: undefined,
      };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      expect(screen.getByText('田')).toBeInTheDocument();
      expect(screen.queryByRole('img', { hidden: true })).not.toBeInTheDocument();
    });

    it('photos あり + currentYear === null: primaryPhotoUrl が img src に設定されること (fallback)', () => {
      setCurrentYear(null);
      const node: PersonNodeType = {
        ...BASE_NODE,
        primaryPhotoUrl: 'https://example.com/primary.jpg',
        photos: [
          { id: 'p1', url: 'https://example.com/photo1.jpg', takenYear: 1970 },
          { id: 'p2', url: 'https://example.com/photo2.jpg', takenYear: 1990 },
        ],
      };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const img = screen.getByRole('img', { name: '田中 太郎', hidden: true });
      expect(img).toHaveAttribute('src', 'https://example.com/primary.jpg');
    });

    it('photos あり + currentYear で近い写真がある: 選ばれた写真の URL が img src に設定されること', () => {
      // currentYear=1985: |1970-1985|=15, |1990-1985|=5 → photo2 (1990) が近い
      setCurrentYear(1985);
      const node: PersonNodeType = {
        ...BASE_NODE,
        primaryPhotoUrl: 'https://example.com/primary.jpg',
        photos: [
          { id: 'p1', url: 'https://example.com/photo1.jpg', takenYear: 1970 },
          { id: 'p2', url: 'https://example.com/photo2.jpg', takenYear: 1990 },
        ],
      };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const img = screen.getByRole('img', { name: '田中 太郎', hidden: true });
      expect(img).toHaveAttribute('src', 'https://example.com/photo2.jpg');
    });

    it('photos あり + takenYear が null のみ: primaryPhotoUrl が表示されること (fallback)', () => {
      setCurrentYear(1980);
      const node: PersonNodeType = {
        ...BASE_NODE,
        primaryPhotoUrl: 'https://example.com/primary.jpg',
        photos: [
          { id: 'p1', url: 'https://example.com/photo1.jpg', takenYear: null },
          { id: 'p2', url: 'https://example.com/photo2.jpg', takenYear: null },
        ],
      };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const img = screen.getByRole('img', { name: '田中 太郎', hidden: true });
      expect(img).toHaveAttribute('src', 'https://example.com/primary.jpg');
    });

    it('photos あり + 同点: 新しい年の写真が選ばれること', () => {
      // currentYear=1980: |1975-1980|=5, |1985-1980|=5 → 同点 → takenYear 大きい 1985 を選択
      setCurrentYear(1980);
      const node: PersonNodeType = {
        ...BASE_NODE,
        primaryPhotoUrl: 'https://example.com/primary.jpg',
        photos: [
          { id: 'p1975', url: 'https://example.com/photo1975.jpg', takenYear: 1975 },
          { id: 'p1985', url: 'https://example.com/photo1985.jpg', takenYear: 1985 },
        ],
      };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const img = screen.getByRole('img', { name: '田中 太郎', hidden: true });
      expect(img).toHaveAttribute('src', 'https://example.com/photo1985.jpg');
    });

    it('photos あり + primaryPhotoUrl なし + takenYear null のみ: プレースホルダが表示されること', () => {
      setCurrentYear(1980);
      const node: PersonNodeType = {
        ...BASE_NODE,
        primaryPhotoUrl: null,
        photos: [
          { id: 'p1', url: 'https://example.com/photo1.jpg', takenYear: null },
        ],
      };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      expect(screen.getByText('田')).toBeInTheDocument();
      expect(screen.queryByRole('img', { hidden: true })).not.toBeInTheDocument();
    });

    it('photos あり + currentYear 完全一致: 一致する写真が表示されること', () => {
      setCurrentYear(1980);
      const node: PersonNodeType = {
        ...BASE_NODE,
        primaryPhotoUrl: 'https://example.com/primary.jpg',
        photos: [
          { id: 'p1', url: 'https://example.com/photo1970.jpg', takenYear: 1970 },
          { id: 'p2', url: 'https://example.com/photo1980.jpg', takenYear: 1980 },
          { id: 'p3', url: 'https://example.com/photo1990.jpg', takenYear: 1990 },
        ],
      };
      render(
        <svg>
          <PersonNode node={node} />
        </svg>
      );

      const img = screen.getByRole('img', { name: '田中 太郎', hidden: true });
      expect(img).toHaveAttribute('src', 'https://example.com/photo1980.jpg');
    });
  });
});
