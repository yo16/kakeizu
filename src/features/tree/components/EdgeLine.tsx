'use client';

/**
 * EdgeLine.tsx
 *
 * 家系図のエッジ (婚姻線・親子線) を SVG <path> で描画するコンポーネント。
 * fvp.4: EdgeType ごとの線種・色マトリクスを実装。
 *   - biological / adoptive / step (parentRole)
 *   - spouse / divorced / same_sex_partner / common_law (marriageStatus + marriageType)
 */

import { memo } from 'react';

import {
  type HierarchyNode,
  type MarriageNode,
  type PersonNode,
  type TreeEdge,
  MARRIAGE_NODE_SIZE,
  NODE_HEIGHT,
  NODE_WIDTH,
} from '../types';
import styles from './EdgeLine.module.css';

interface EdgeLineProps {
  edge: TreeEdge;
  nodes: HierarchyNode[];
}

// ─── ヘルパー: ノード検索 ─────────────────────────────────

function findPersonNode(nodes: HierarchyNode[], id: string): PersonNode | undefined {
  return nodes.find((n): n is PersonNode => n.type === 'person' && n.id === id);
}

function findMarriageNode(nodes: HierarchyNode[], id: string): MarriageNode | undefined {
  return nodes.find((n): n is MarriageNode => n.type === 'marriage' && n.id === id);
}

// ─── 婚姻線クラス判定 ────────────────────────────────────

/**
 * marriageStatus / marriageType の組み合わせから CSS クラスを決定する。
 * 優先順位:
 *  1. divorced → marriageLineDivorced
 *  2. same_sex_partner → marriageLineSameSex
 *  3. common_law → marriageLineCommonLaw
 *  4. その他 (spouse / current / widowed など) → marriageLine (デフォルト)
 */
function getMarriageLineClass(
  marriageStatus: TreeEdge['marriageStatus'],
  marriageType: TreeEdge['marriageType'],
): string {
  if (marriageStatus === 'divorced') return styles.marriageLineDivorced;
  if (marriageType === 'same_sex_partner') return styles.marriageLineSameSex;
  if (marriageType === 'common_law') return styles.marriageLineCommonLaw;
  return styles.marriageLine;
}

// ─── 婚姻線 (PersonNode → MarriageNode) ─────────────────

function MarriageLine({ edge, nodes }: { edge: TreeEdge; nodes: HierarchyNode[] }) {
  const person = findPersonNode(nodes, edge.fromId);
  const marriage = findMarriageNode(nodes, edge.toId);

  if (!person || !marriage) return null;

  // PersonNode の中央から MarriageNode の中心へ
  const personCenterX = person.x + NODE_WIDTH / 2;
  const personCenterY = person.y + NODE_HEIGHT / 2;
  const marriageCenterX = marriage.x + MARRIAGE_NODE_SIZE / 2;
  const marriageCenterY = marriage.y + MARRIAGE_NODE_SIZE / 2;

  const d = `M ${personCenterX} ${personCenterY} L ${marriageCenterX} ${marriageCenterY}`;

  const lineClass = getMarriageLineClass(edge.marriageStatus, edge.marriageType);

  return (
    <path
      d={d}
      className={lineClass}
      aria-hidden="true"
    />
  );
}

// ─── 親子線 (MarriageNode or PersonNode → PersonNode) ────

function ParentChildLine({
  edge,
  nodes,
}: {
  edge: TreeEdge;
  nodes: HierarchyNode[];
}) {
  const child = findPersonNode(nodes, edge.toId);
  if (!child) return null;

  // 親は MarriageNode または PersonNode のどちらか
  const parentNode = nodes.find((n) => n.id === edge.fromId);
  if (!parentNode) return null;

  let fromX: number;
  let fromY: number;

  if (parentNode.type === 'marriage') {
    fromX = parentNode.x + MARRIAGE_NODE_SIZE / 2;
    fromY = parentNode.y + MARRIAGE_NODE_SIZE;
  } else {
    fromX = parentNode.x + NODE_WIDTH / 2;
    fromY = parentNode.y + NODE_HEIGHT;
  }

  const toX = child.x + NODE_WIDTH / 2;
  const toY = child.y;

  // ベジェ曲線でなめらかに接続
  const midY = (fromY + toY) / 2;
  const d = `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;

  const lineClass =
    edge.parentRole === 'adoptive'
      ? styles.adoptiveLine
      : edge.parentRole === 'step'
        ? styles.stepLine
        : styles.biologicalLine;

  return (
    <path
      d={d}
      className={lineClass}
      aria-hidden="true"
    />
  );
}

// ─── メインコンポーネント ─────────────────────────────────

export const EdgeLine = memo(function EdgeLine({ edge, nodes }: EdgeLineProps) {
  if (edge.kind === 'marriage_line') {
    return <MarriageLine edge={edge} nodes={nodes} />;
  }
  return <ParentChildLine edge={edge} nodes={nodes} />;
});
