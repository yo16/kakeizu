/**
 * EdgeLine コンポーネントのテスト
 *
 * marriage_line / parent_child_line の描画、ノード不在時のハンドリングを検証する。
 */

import { render } from '@testing-library/react';
import { EdgeLine } from '../EdgeLine';
import {
  type HierarchyNode,
  type TreeEdge,
  type PersonNode,
  type MarriageNode,
} from '../../types';

// テスト用ノード
const PERSON_A: PersonNode = {
  type: 'person',
  id: 'person-a',
  generation: 0,
  x: 0,
  y: 0,
  displayName: '田中 太郎',
  birthYear: 1950,
  deathYear: null,
  primaryPhotoUrl: null,
};

const PERSON_B: PersonNode = {
  type: 'person',
  id: 'person-b',
  generation: 0,
  x: 200,
  y: 0,
  displayName: '田中 花子',
  birthYear: 1955,
  deathYear: null,
  primaryPhotoUrl: null,
};

const PERSON_CHILD: PersonNode = {
  type: 'person',
  id: 'person-child',
  generation: 1,
  x: 100,
  y: 200,
  displayName: '田中 一郎',
  birthYear: 1980,
  deathYear: null,
  primaryPhotoUrl: null,
};

const MARRIAGE_NODE: MarriageNode = {
  type: 'marriage',
  id: 'marriage-001',
  relationId: 'relation-001',
  partnerAId: 'person-a',
  partnerBId: 'person-b',
  marriageStatus: 'current',
  marriageType: 'spouse',
  generation: 0,
  x: 100,
  y: 50,
};

const ALL_NODES: HierarchyNode[] = [PERSON_A, PERSON_B, PERSON_CHILD, MARRIAGE_NODE];

describe('EdgeLine', () => {
  // -------------------------------------------------------------------------
  // marriage_line の描画
  // -------------------------------------------------------------------------
  describe('marriage_line の描画', () => {
    it('marriage_line: path 要素が描画されること', () => {
      const edge: TreeEdge = {
        id: 'edge-001',
        kind: 'marriage_line',
        fromId: 'person-a',
        toId: 'marriage-001',
      };
      const { container } = render(
        <svg>
          <EdgeLine edge={edge} nodes={ALL_NODES} />
        </svg>
      );

      const path = container.querySelector('path');
      expect(path).toBeInTheDocument();
    });

    it('marriage_line: path の d 属性が設定されていること', () => {
      const edge: TreeEdge = {
        id: 'edge-001',
        kind: 'marriage_line',
        fromId: 'person-a',
        toId: 'marriage-001',
      };
      const { container } = render(
        <svg>
          <EdgeLine edge={edge} nodes={ALL_NODES} />
        </svg>
      );

      const path = container.querySelector('path');
      expect(path).toHaveAttribute('d');
      expect(path?.getAttribute('d')).not.toBe('');
    });

    it('marriage_line: marriageLine クラスが適用されること', () => {
      const edge: TreeEdge = {
        id: 'edge-001',
        kind: 'marriage_line',
        fromId: 'person-a',
        toId: 'marriage-001',
      };
      const { container } = render(
        <svg>
          <EdgeLine edge={edge} nodes={ALL_NODES} />
        </svg>
      );

      const path = container.querySelector('path');
      expect(path?.className.baseVal ?? path?.getAttribute('class') ?? '').toContain('marriageLine');
    });
  });

  // -------------------------------------------------------------------------
  // parent_child_line の描画
  // -------------------------------------------------------------------------
  describe('parent_child_line の描画', () => {
    it('parent_child_line (MarriageNode → PersonNode): path が描画されること', () => {
      const edge: TreeEdge = {
        id: 'edge-002',
        kind: 'parent_child_line',
        fromId: 'marriage-001',
        toId: 'person-child',
        parentRole: 'biological',
      };
      const { container } = render(
        <svg>
          <EdgeLine edge={edge} nodes={ALL_NODES} />
        </svg>
      );

      const path = container.querySelector('path');
      expect(path).toBeInTheDocument();
    });

    it('parent_child_line (PersonNode → PersonNode): path が描画されること', () => {
      const edge: TreeEdge = {
        id: 'edge-003',
        kind: 'parent_child_line',
        fromId: 'person-a',
        toId: 'person-child',
        parentRole: 'biological',
      };
      const { container } = render(
        <svg>
          <EdgeLine edge={edge} nodes={ALL_NODES} />
        </svg>
      );

      const path = container.querySelector('path');
      expect(path).toBeInTheDocument();
    });

    it('parent_child_line: biologicalLine クラスが適用されること (parentRole=biological)', () => {
      const edge: TreeEdge = {
        id: 'edge-002',
        kind: 'parent_child_line',
        fromId: 'marriage-001',
        toId: 'person-child',
        parentRole: 'biological',
      };
      const { container } = render(
        <svg>
          <EdgeLine edge={edge} nodes={ALL_NODES} />
        </svg>
      );

      const path = container.querySelector('path');
      expect(path?.className.baseVal ?? path?.getAttribute('class') ?? '').toContain('biologicalLine');
    });

    it('parent_child_line: adoptiveLine クラスが適用されること (parentRole=adoptive)', () => {
      const edge: TreeEdge = {
        id: 'edge-002',
        kind: 'parent_child_line',
        fromId: 'marriage-001',
        toId: 'person-child',
        parentRole: 'adoptive',
      };
      const { container } = render(
        <svg>
          <EdgeLine edge={edge} nodes={ALL_NODES} />
        </svg>
      );

      const path = container.querySelector('path');
      expect(path?.className.baseVal ?? path?.getAttribute('class') ?? '').toContain('adoptiveLine');
    });

    it('parent_child_line: stepLine クラスが適用されること (parentRole=step)', () => {
      const edge: TreeEdge = {
        id: 'edge-002',
        kind: 'parent_child_line',
        fromId: 'marriage-001',
        toId: 'person-child',
        parentRole: 'step',
      };
      const { container } = render(
        <svg>
          <EdgeLine edge={edge} nodes={ALL_NODES} />
        </svg>
      );

      const path = container.querySelector('path');
      expect(path?.className.baseVal ?? path?.getAttribute('class') ?? '').toContain('stepLine');
    });
  });

  // -------------------------------------------------------------------------
  // ノードが nodes 配列にない場合のハンドリング
  // -------------------------------------------------------------------------
  describe('ノード不在時のハンドリング', () => {
    it('marriage_line: fromId に対応するノードがない場合は描画されないこと', () => {
      const edge: TreeEdge = {
        id: 'edge-missing',
        kind: 'marriage_line',
        fromId: 'non-existent-person',
        toId: 'marriage-001',
      };
      const { container } = render(
        <svg>
          <EdgeLine edge={edge} nodes={ALL_NODES} />
        </svg>
      );

      const path = container.querySelector('path');
      expect(path).not.toBeInTheDocument();
    });

    it('marriage_line: toId に対応するノードがない場合は描画されないこと', () => {
      const edge: TreeEdge = {
        id: 'edge-missing',
        kind: 'marriage_line',
        fromId: 'person-a',
        toId: 'non-existent-marriage',
      };
      const { container } = render(
        <svg>
          <EdgeLine edge={edge} nodes={ALL_NODES} />
        </svg>
      );

      const path = container.querySelector('path');
      expect(path).not.toBeInTheDocument();
    });

    it('parent_child_line: toId (子) に対応するノードがない場合は描画されないこと', () => {
      const edge: TreeEdge = {
        id: 'edge-missing',
        kind: 'parent_child_line',
        fromId: 'marriage-001',
        toId: 'non-existent-child',
        parentRole: 'biological',
      };
      const { container } = render(
        <svg>
          <EdgeLine edge={edge} nodes={ALL_NODES} />
        </svg>
      );

      const path = container.querySelector('path');
      expect(path).not.toBeInTheDocument();
    });

    it('parent_child_line: fromId (親) に対応するノードがない場合は描画されないこと', () => {
      const edge: TreeEdge = {
        id: 'edge-missing',
        kind: 'parent_child_line',
        fromId: 'non-existent-parent',
        toId: 'person-child',
        parentRole: 'biological',
      };
      const { container } = render(
        <svg>
          <EdgeLine edge={edge} nodes={ALL_NODES} />
        </svg>
      );

      const path = container.querySelector('path');
      expect(path).not.toBeInTheDocument();
    });

    it('nodes が空配列の場合は描画されないこと', () => {
      const edge: TreeEdge = {
        id: 'edge-001',
        kind: 'marriage_line',
        fromId: 'person-a',
        toId: 'marriage-001',
      };
      const { container } = render(
        <svg>
          <EdgeLine edge={edge} nodes={[]} />
        </svg>
      );

      const path = container.querySelector('path');
      expect(path).not.toBeInTheDocument();
    });
  });
});
