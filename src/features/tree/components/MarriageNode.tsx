'use client';

/**
 * MarriageNode.tsx
 *
 * 婚姻ノード (仮想ノード) を SVG <g> 要素で描画するコンポーネント。
 * tree-visualization-design.md §1 特殊ケースの視覚的表現 に準拠。
 *
 * - 小さな菱形アイコン
 * - 婚姻種別 (spouse / common_law / same_sex_partner) で色を変える
 * - fvp.4 で詳細マトリクスを実装するためここでは最小限
 */

import { memo } from 'react';

import { type MarriageNode as MarriageNodeType, MARRIAGE_NODE_SIZE } from '../types';
import styles from './MarriageNode.module.css';

interface MarriageNodeProps {
  node: MarriageNodeType;
  onClick?: (id: string) => void;
  isSelected?: boolean;
}

/** 婚姻種別に対応する色クラスを返す */
function getTypeClass(marriageType: MarriageNodeType['marriageType']): string {
  switch (marriageType) {
    case 'common_law':
      return styles.commonLaw;
    case 'same_sex_partner':
      return styles.sameSexPartner;
    default:
      return styles.spouse;
  }
}

/** 婚姻ステータスに対応するクラスを返す */
function getStatusClass(status: MarriageNodeType['marriageStatus']): string {
  switch (status) {
    case 'divorced':
      return styles.divorced;
    case 'widowed':
      return styles.widowed;
    default:
      return '';
  }
}

export const MarriageNode = memo(function MarriageNode({
  node,
  onClick,
  isSelected,
}: MarriageNodeProps) {
  const half = MARRIAGE_NODE_SIZE / 2;
  const cx = node.x + half;
  const cy = node.y + half;

  // 菱形の頂点
  const points = [
    `${cx},${cy - half}`,
    `${cx + half},${cy}`,
    `${cx},${cy + half}`,
    `${cx - half},${cy}`,
  ].join(' ');

  const typeClass = getTypeClass(node.marriageType);
  const statusClass = getStatusClass(node.marriageStatus);

  function handleClick() {
    onClick?.(node.id);
  }

  function handleKeyDown(e: React.KeyboardEvent<SVGGElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(node.id);
    }
  }

  const label = `婚姻ノード (${node.marriageType === 'same_sex_partner' ? '同性パートナー' : node.marriageType === 'common_law' ? '事実婚' : '婚姻'})`;

  return (
    <g
      className={`${styles.group} ${onClick ? styles.clickable : ''}`}
      onClick={onClick ? handleClick : undefined}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={label}
    >
      <polygon
        points={points}
        className={`${styles.diamond} ${typeClass} ${statusClass} ${isSelected ? styles.selected : ''}`}
      />
    </g>
  );
});
