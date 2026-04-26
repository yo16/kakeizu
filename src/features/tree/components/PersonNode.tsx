'use client';

/**
 * PersonNode.tsx
 *
 * 家系図の人物ノードを SVG <foreignObject> 内の HTML で描画するコンポーネント。
 * tree-visualization-design.md §2 ノードのデザイン に準拠。
 *
 * - 氏名 / 生没年 / 代表写真プレースホルダ (fvp.2 時点)
 * - React.memo で不必要な再レンダリングを抑制
 */

import { memo } from 'react';

import { type PersonNode as PersonNodeType, NODE_HEIGHT, NODE_WIDTH } from '../types';
import styles from './PersonNode.module.css';

interface PersonNodeProps {
  node: PersonNodeType;
  onClick?: (id: string) => void;
}

/** 生没年の表示文字列を生成する */
function formatLifespan(birthYear: number | null, deathYear: number | null): string {
  if (birthYear === null && deathYear === null) return '';
  const birth = birthYear !== null ? String(birthYear) : '?';
  const death = deathYear !== null ? String(deathYear) : '';
  return `${birth} - ${death}`;
}

export const PersonNode = memo(function PersonNode({ node, onClick }: PersonNodeProps) {
  const lifespan = formatLifespan(node.birthYear, node.deathYear);
  const isDeceased = node.deathYear !== null;

  function handleClick() {
    onClick?.(node.id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(node.id);
    }
  }

  return (
    <foreignObject
      x={node.x}
      y={node.y}
      width={NODE_WIDTH}
      height={NODE_HEIGHT}
      aria-label={`${node.displayName}${lifespan ? ` (${lifespan})` : ''}`}
    >
      {/* xmlns は foreignObject 内の HTML のために必要 */}
      <div
        className={`${styles.node} ${isDeceased ? styles.deceased : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        {/* アバター (プレースホルダ) */}
        <div className={styles.avatar} aria-hidden="true">
          {node.primaryPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={node.primaryPhotoUrl}
              alt={node.displayName}
              className={styles.avatarImage}
            />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {node.displayName.charAt(0)}
            </div>
          )}
        </div>

        {/* 氏名・生没年 */}
        <div className={styles.info}>
          <span className={styles.name}>{node.displayName}</span>
          {lifespan && (
            <span className={styles.lifespan} aria-label={`生没年: ${lifespan}`}>
              {lifespan}
            </span>
          )}
          {isDeceased && (
            <span className={styles.deceasedMark} aria-label="故人">†</span>
          )}
        </div>
      </div>
    </foreignObject>
  );
});
