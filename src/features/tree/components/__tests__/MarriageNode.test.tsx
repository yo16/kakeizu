/**
 * MarriageNode コンポーネントのテスト
 *
 * 婚姻種別ごとのクラス適用、クリックハンドラ、aria-label を検証する。
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarriageNode } from '../MarriageNode';
import { type MarriageNode as MarriageNodeType } from '../../types';

/** ベーステストデータ */
const BASE_NODE: MarriageNodeType = {
  type: 'marriage',
  id: 'marriage-001',
  relationId: 'relation-001',
  partnerAId: 'person-001',
  partnerBId: 'person-002',
  marriageStatus: 'current',
  marriageType: 'spouse',
  generation: 0,
  x: 100,
  y: 100,
};

describe('MarriageNode', () => {
  // -------------------------------------------------------------------------
  // 婚姻種別ごとのクラス・aria-label
  // -------------------------------------------------------------------------
  describe('婚姻種別ごとのクラス・aria-label', () => {
    it('spouse: 婚姻ノードとして aria-label が設定されること', () => {
      const node: MarriageNodeType = { ...BASE_NODE, marriageType: 'spouse' };
      const { container } = render(
        <svg>
          <MarriageNode node={node} />
        </svg>
      );

      // SVG <g> 要素には標準の role がないため getByRole では取得できない
      // container.querySelector で aria-label 付き g 要素を取得する
      const group = container.querySelector('g[aria-label]');
      // aria-label に「婚姻」が含まれること
      expect(group?.getAttribute('aria-label') ?? '').toContain('婚姻');
    });

    it('spouse: polygon に spouse クラスが適用されること', () => {
      const node: MarriageNodeType = { ...BASE_NODE, marriageType: 'spouse' };
      render(
        <svg>
          <MarriageNode node={node} />
        </svg>
      );

      const polygon = document.querySelector('polygon');
      expect(polygon?.className.baseVal ?? polygon?.getAttribute('class') ?? '').toContain('spouse');
    });

    it('common_law: polygon に commonLaw クラスが適用されること', () => {
      const node: MarriageNodeType = { ...BASE_NODE, marriageType: 'common_law' };
      render(
        <svg>
          <MarriageNode node={node} />
        </svg>
      );

      const polygon = document.querySelector('polygon');
      expect(polygon?.className.baseVal ?? polygon?.getAttribute('class') ?? '').toContain('commonLaw');
    });

    it('common_law: aria-label に「事実婚」が含まれること', () => {
      const node: MarriageNodeType = { ...BASE_NODE, marriageType: 'common_law' };
      render(
        <svg>
          <MarriageNode node={node} />
        </svg>
      );

      const group = document.querySelector('g[aria-label]');
      expect(group?.getAttribute('aria-label') ?? '').toContain('事実婚');
    });

    it('same_sex_partner: polygon に sameSexPartner クラスが適用されること', () => {
      const node: MarriageNodeType = { ...BASE_NODE, marriageType: 'same_sex_partner' };
      render(
        <svg>
          <MarriageNode node={node} />
        </svg>
      );

      const polygon = document.querySelector('polygon');
      expect(polygon?.className.baseVal ?? polygon?.getAttribute('class') ?? '').toContain('sameSexPartner');
    });

    it('same_sex_partner: aria-label に「同性パートナー」が含まれること', () => {
      const node: MarriageNodeType = { ...BASE_NODE, marriageType: 'same_sex_partner' };
      render(
        <svg>
          <MarriageNode node={node} />
        </svg>
      );

      const group = document.querySelector('g[aria-label]');
      expect(group?.getAttribute('aria-label') ?? '').toContain('同性パートナー');
    });
  });

  // -------------------------------------------------------------------------
  // 婚姻ステータスのクラス
  // -------------------------------------------------------------------------
  describe('婚姻ステータスのクラス', () => {
    it('divorced: polygon に divorced クラスが適用されること', () => {
      const node: MarriageNodeType = { ...BASE_NODE, marriageStatus: 'divorced' };
      render(
        <svg>
          <MarriageNode node={node} />
        </svg>
      );

      const polygon = document.querySelector('polygon');
      expect(polygon?.className.baseVal ?? polygon?.getAttribute('class') ?? '').toContain('divorced');
    });

    it('widowed: polygon に widowed クラスが適用されること', () => {
      const node: MarriageNodeType = { ...BASE_NODE, marriageStatus: 'widowed' };
      render(
        <svg>
          <MarriageNode node={node} />
        </svg>
      );

      const polygon = document.querySelector('polygon');
      expect(polygon?.className.baseVal ?? polygon?.getAttribute('class') ?? '').toContain('widowed');
    });

    it('current: divorced/widowed クラスが付与されないこと', () => {
      const node: MarriageNodeType = { ...BASE_NODE, marriageStatus: 'current' };
      render(
        <svg>
          <MarriageNode node={node} />
        </svg>
      );

      const polygon = document.querySelector('polygon');
      const className = polygon?.className.baseVal ?? polygon?.getAttribute('class') ?? '';
      expect(className).not.toContain('divorced');
      expect(className).not.toContain('widowed');
    });
  });

  // -------------------------------------------------------------------------
  // クリックハンドラ
  // -------------------------------------------------------------------------
  describe('クリックハンドラ', () => {
    it('onClick が渡された場合: クリックでハンドラが呼ばれること', async () => {
      const user = userEvent.setup();
      const onClick = jest.fn();
      const node: MarriageNodeType = { ...BASE_NODE };
      render(
        <svg>
          <MarriageNode node={node} onClick={onClick} />
        </svg>
      );

      await user.click(screen.getByRole('button'));

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith('marriage-001');
    });

    it('onClick が渡された場合: button role が付与されること', () => {
      const onClick = jest.fn();
      const node: MarriageNodeType = { ...BASE_NODE };
      render(
        <svg>
          <MarriageNode node={node} onClick={onClick} />
        </svg>
      );

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('onClick がない場合: button role が付与されないこと', () => {
      const node: MarriageNodeType = { ...BASE_NODE };
      render(
        <svg>
          <MarriageNode node={node} />
        </svg>
      );

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('onClick がない場合: クリックしてもエラーにならないこと', async () => {
      const user = userEvent.setup();
      const node: MarriageNodeType = { ...BASE_NODE };
      render(
        <svg>
          <MarriageNode node={node} />
        </svg>
      );

      const group = document.querySelector('g');
      expect(() => user.click(group!)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // isSelected prop のハイライト対応
  // -------------------------------------------------------------------------
  describe('isSelected prop', () => {
    it('isSelected=true で polygon に selected クラスが付与されること', () => {
      const node: MarriageNodeType = { ...BASE_NODE };
      render(
        <svg>
          <MarriageNode node={node} isSelected={true} />
        </svg>
      );

      const polygon = document.querySelector('polygon');
      expect(polygon?.className.baseVal ?? polygon?.getAttribute('class') ?? '').toContain('selected');
    });

    it('isSelected=false で polygon に selected クラスが付与されないこと', () => {
      const node: MarriageNodeType = { ...BASE_NODE };
      render(
        <svg>
          <MarriageNode node={node} isSelected={false} />
        </svg>
      );

      const polygon = document.querySelector('polygon');
      expect(polygon?.className.baseVal ?? polygon?.getAttribute('class') ?? '').not.toContain('selected');
    });

    it('isSelected 未指定で polygon に selected クラスが付与されないこと', () => {
      const node: MarriageNodeType = { ...BASE_NODE };
      render(
        <svg>
          <MarriageNode node={node} />
        </svg>
      );

      const polygon = document.querySelector('polygon');
      expect(polygon?.className.baseVal ?? polygon?.getAttribute('class') ?? '').not.toContain('selected');
    });
  });

  // -------------------------------------------------------------------------
  // 菱形 (polygon) の描画
  // -------------------------------------------------------------------------
  describe('菱形の描画', () => {
    it('polygon 要素が描画されること', () => {
      const node: MarriageNodeType = { ...BASE_NODE };
      render(
        <svg>
          <MarriageNode node={node} />
        </svg>
      );

      const polygon = document.querySelector('polygon');
      expect(polygon).toBeInTheDocument();
    });

    it('polygon の points 属性が設定されていること', () => {
      const node: MarriageNodeType = { ...BASE_NODE };
      render(
        <svg>
          <MarriageNode node={node} />
        </svg>
      );

      const polygon = document.querySelector('polygon');
      expect(polygon).toHaveAttribute('points');
      expect(polygon?.getAttribute('points')).not.toBe('');
    });
  });
});
