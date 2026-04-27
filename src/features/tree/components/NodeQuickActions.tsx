'use client';

/**
 * NodeQuickActions.tsx
 *
 * PersonNode ホバー時に表示する近接ボタン (+親 / +子 / +配偶者)。
 *
 * - SVG transform (zoom/pan) を考慮した DOM オーバーレイ方式
 * - 透明な当たり判定矩形でノード+ボタン領域を安定化
 * - 複数配偶者がいる場合、+子 クリックで配偶者ペア選択ポップオーバーを表示
 *
 * tree-visualization-design.md §6 近接ボタン (FR-V5) に準拠。
 */

import React, { useRef, useState, useCallback } from 'react';

import type { RelationRow } from '@/features/relation/actions';
import { NODE_WIDTH, NODE_HEIGHT } from '../types';
import styles from './NodeQuickActions.module.css';

/** 近接ボタンで追加する関係の種類 */
export type RelativeKind = 'parent' | 'child' | 'spouse';

export interface SpouseOption {
  personId: string;
  displayName: string;
}

export interface NodeQuickActionsProps {
  /** ホバー対象の person.id */
  personId: string;
  /** SVG 上でのノード左上 X 座標 (foreignObject の x 属性値) */
  nodeX: number;
  /** SVG 上でのノード左上 Y 座標 (foreignObject の y 属性値) */
  nodeY: number;
  /** d3-zoom の現在の translate X */
  transformX: number;
  /** d3-zoom の現在の translate Y */
  transformY: number;
  /** d3-zoom の現在のスケール */
  transformK: number;
  /** この person の配偶者一覧 (複数配偶者の +子 選択に使用) */
  spouses: SpouseOption[];
  /** 近接ボタンクリック時のコールバック */
  onQuickAdd: (kind: RelativeKind, spouseId?: string) => void;
  /** ホバー領域を離れたときのコールバック */
  onLeave: () => void;
}

/** ポップオーバーの高さ推定値 (px) — 配偶者 1 件あたり */
const POPOVER_ITEM_HEIGHT = 44;
const POPOVER_HEADER_HEIGHT = 32;

export function NodeQuickActions({
  nodeX,
  nodeY,
  transformX,
  transformY,
  transformK,
  spouses,
  onQuickAdd,
  onLeave,
}: NodeQuickActionsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showSpousePopover, setShowSpousePopover] = useState(false);

  // SVG 座標 → DOM 座標変換
  const domX = nodeX * transformK + transformX;
  const domY = nodeY * transformK + transformY;
  const scaledW = NODE_WIDTH * transformK;
  const scaledH = NODE_HEIGHT * transformK;

  // ボタンの実サイズ
  const BTN_SIZE = Math.max(24, Math.round(28 * transformK));
  const BTN_OFFSET = Math.round(8 * transformK);

  // 当たり判定矩形: ボタン含む全領域
  const hitPad = BTN_SIZE + BTN_OFFSET + 4;
  const hitLeft = domX - hitPad;
  const hitTop = domY - hitPad;
  const hitWidth = scaledW + hitPad * 2;
  const hitHeight = scaledH + hitPad * 2;

  // +子 クリック
  const handleChildClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (spouses.length > 1) {
        setShowSpousePopover((v) => !v);
      } else if (spouses.length === 1) {
        // 単一配偶者の場合は自動選択
        onQuickAdd('child', spouses[0].personId);
      } else {
        // 配偶者なし
        onQuickAdd('child', undefined);
      }
    },
    [spouses, onQuickAdd]
  );

  const handleParentClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onQuickAdd('parent');
    },
    [onQuickAdd]
  );

  const handleSpouseClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onQuickAdd('spouse');
    },
    [onQuickAdd]
  );

  const handleSpouseOptionClick = useCallback(
    (spouseId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setShowSpousePopover(false);
      onQuickAdd('child', spouseId);
    },
    [onQuickAdd]
  );

  // 当たり判定矩形を離れたときに非表示
  function handleMouseLeave(e: React.MouseEvent<HTMLDivElement>) {
    // relatedTarget が自身の子要素であれば無視
    const related = e.relatedTarget as Node | null;
    if (containerRef.current && related && containerRef.current.contains(related)) {
      return;
    }
    setShowSpousePopover(false);
    onLeave();
  }

  // ポップオーバーの高さ
  const popoverHeight =
    POPOVER_HEADER_HEIGHT + spouses.length * POPOVER_ITEM_HEIGHT + 8;

  return (
    <div
      ref={containerRef}
      className={styles.hitArea}
      style={{
        left: hitLeft,
        top: hitTop,
        width: hitWidth,
        height: hitHeight,
      }}
      onMouseLeave={handleMouseLeave}
    >
      {/* +親 ボタン (上) */}
      <button
        type="button"
        className={styles.quickBtn}
        style={{
          left: hitPad + scaledW / 2 - BTN_SIZE / 2,
          top: hitPad - BTN_SIZE - BTN_OFFSET,
          width: BTN_SIZE,
          height: BTN_SIZE,
          fontSize: Math.max(11, Math.round(13 * transformK)),
        }}
        onClick={handleParentClick}
        aria-label="親を追加"
        title="+ 親を追加"
      >
        +親
      </button>

      {/* +子 ボタン (下) */}
      <button
        type="button"
        className={`${styles.quickBtn} ${showSpousePopover ? styles.quickBtnActive : ''}`}
        style={{
          left: hitPad + scaledW / 2 - BTN_SIZE / 2,
          top: hitPad + scaledH + BTN_OFFSET,
          width: BTN_SIZE,
          height: BTN_SIZE,
          fontSize: Math.max(11, Math.round(13 * transformK)),
        }}
        onClick={handleChildClick}
        aria-label="子を追加"
        aria-haspopup={spouses.length > 1 ? 'listbox' : undefined}
        aria-expanded={spouses.length > 1 ? showSpousePopover : undefined}
        title="+ 子を追加"
      >
        +子
      </button>

      {/* +配偶者 ボタン (右) */}
      <button
        type="button"
        className={styles.quickBtn}
        style={{
          left: hitPad + scaledW + BTN_OFFSET,
          top: hitPad + scaledH / 2 - BTN_SIZE / 2,
          width: BTN_SIZE,
          height: BTN_SIZE,
          fontSize: Math.max(11, Math.round(13 * transformK)),
        }}
        onClick={handleSpouseClick}
        aria-label="配偶者を追加"
        title="+ 配偶者を追加"
      >
        +配
      </button>

      {/* 配偶者ペア選択ポップオーバー (複数配偶者時の +子 用) */}
      {showSpousePopover && spouses.length > 1 && (
        <div
          className={styles.spousePopover}
          style={{
            left: hitPad + scaledW / 2 - BTN_SIZE / 2,
            top: hitPad + scaledH + BTN_OFFSET + BTN_SIZE + 4,
            height: popoverHeight,
          }}
          role="listbox"
          aria-label="どの配偶者との子ですか？"
        >
          <div className={styles.popoverHeader}>配偶者を選択</div>
          {/* 配偶者なし (未婚の子) */}
          <button
            type="button"
            className={styles.spouseOption}
            role="option"
            aria-selected={false}
            tabIndex={0}
            onClick={(e) => handleSpouseOptionClick('', e)}
          >
            配偶者なし (未婚の子)
          </button>
          {spouses.map((s) => (
            <button
              key={s.personId}
              type="button"
              className={styles.spouseOption}
              role="option"
              aria-selected={false}
              tabIndex={0}
              onClick={(e) => handleSpouseOptionClick(s.personId, e)}
            >
              {s.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 指定した person の配偶者一覧を relations から取得する。
 */
export function getSpousesForPerson(
  personId: string,
  relations: RelationRow[],
  persons: { id: string; displayName: string }[]
): SpouseOption[] {
  const personMap = new Map(persons.map((p) => [p.id, p.displayName]));
  const spouseIds = new Set<string>();

  for (const rel of relations) {
    if (rel.kind !== 'marriage') continue;
    if (rel.fromPersonId === personId) {
      spouseIds.add(rel.toPersonId);
    } else if (rel.toPersonId === personId) {
      spouseIds.add(rel.fromPersonId);
    }
  }

  return Array.from(spouseIds)
    .map((id) => ({
      personId: id,
      displayName: personMap.get(id) ?? '不明',
    }));
}
