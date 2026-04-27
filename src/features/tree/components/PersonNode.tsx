'use client';

/**
 * PersonNode.tsx
 *
 * 家系図の人物ノードを SVG <foreignObject> 内の HTML で描画するコンポーネント。
 * tree-visualization-design.md §2 ノードのデザイン に準拠。
 *
 * - 氏名 / 生没年 / 代表写真プレースホルダ (fvp.2 時点)
 * - React.memo で不必要な再レンダリングを抑制
 * - タイムライン連動: currentYear が設定されている場合、
 *   生年 ≤ currentYear ≤ 没年 のノードを強調、それ以外を薄く表示 (kakeizu-rgs.1)
 */

import { memo } from 'react';

import { pickPhotoByYear } from '@/lib/photo/select-by-year';
import { type PersonNode as PersonNodeType, NODE_HEIGHT, NODE_WIDTH } from '../types';
import { useTreeEditorStore } from '../state/tree-editor-store';
import styles from './PersonNode.module.css';

interface PersonNodeProps {
  node: PersonNodeType;
  onClick?: (id: string) => void;
  isSelected?: boolean;
}

/**
 * currentYear に対してノードがアクティブかどうかを判定する。
 *
 * - currentYear が null → すべてアクティブ (フィルタなし)
 * - birthYear ≤ currentYear ≤ deathYear (deathYear が null = 存命) → アクティブ
 * - それ以外 → 非アクティブ (薄く表示)
 */
function isActiveForYear(
  birthYear: number | null,
  deathYear: number | null,
  currentYear: number | null
): boolean {
  if (currentYear === null) {
    return true;
  }
  // 生年より前は非アクティブ
  if (birthYear !== null && currentYear < birthYear) {
    return false;
  }
  // 没年より後は非アクティブ (没年が設定されている場合)
  if (deathYear !== null && currentYear > deathYear) {
    return false;
  }
  return true;
}

/** 生没年の表示文字列を生成する */
function formatLifespan(birthYear: number | null, deathYear: number | null): string {
  if (birthYear === null && deathYear === null) return '';
  const birth = birthYear !== null ? String(birthYear) : '?';
  const death = deathYear !== null ? String(deathYear) : '';
  return `${birth} - ${death}`;
}

export const PersonNode = memo(function PersonNode({ node, onClick, isSelected }: PersonNodeProps) {
  const lifespan = formatLifespan(node.birthYear, node.deathYear);
  const isDeceased = node.deathYear !== null;

  // タイムライン連動: Zustand から currentYear を購読
  const currentYear = useTreeEditorStore((s) => s.currentYear);
  const isActive = isActiveForYear(node.birthYear, node.deathYear, currentYear);

  // 年連動写真切替: photos がある場合は pickPhotoByYear で選択、なければ primaryPhotoUrl を使用
  const fallbackPhoto = node.primaryPhotoUrl
    ? { id: '__primary__', url: node.primaryPhotoUrl, takenYear: null }
    : null;
  const selectedPhoto =
    node.photos && node.photos.length > 0
      ? pickPhotoByYear(node.photos, currentYear, fallbackPhoto)
      : fallbackPhoto;
  const displayPhotoUrl = selectedPhoto?.url ?? null;

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
      <div
        className={`${styles.node} ${isDeceased ? styles.deceased : ''} ${isSelected ? styles.selected : ''} ${!isActive ? styles.faded : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        {/* アバター (年連動切替写真 or プレースホルダ) */}
        <div className={styles.avatar} aria-hidden="true">
          {displayPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayPhotoUrl}
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
