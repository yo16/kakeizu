'use client';

/**
 * TreeCanvas.tsx
 *
 * SVG ベースの家系図描画コンテナ。d3-zoom によるズーム/パンを提供する。
 *
 * - ズーム範囲: 0.25〜4x
 * - フィット表示ボタン内蔵
 * - PersonNode / MarriageNode / EdgeLine を子コンポーネントとして描画
 *
 * tree-visualization-design.md §5 ズーム・パン に準拠。
 */

import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import {
  type HierarchyNode,
  type MarriageNode as MarriageNodeType,
  type PersonNode as PersonNodeType,
  type TreeEdge,
  type TreeLayout,
} from '../types';
import { EdgeLine } from './EdgeLine';
import { MarriageNode } from './MarriageNode';
import { PersonNode } from './PersonNode';
import styles from './TreeCanvas.module.css';

// ─────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const FIT_PADDING = 48; // フィット時の余白 (px)
const TRANSITION_DURATION = 200; // フィットアニメーション (ms)

// ─────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────

interface TreeCanvasProps {
  layout: TreeLayout;
  onPersonClick?: (personId: string) => void;
  onMarriageClick?: (marriageId: string) => void;
}

// ─────────────────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────────────────

export const TreeCanvas = memo(function TreeCanvas({
  layout,
  onPersonClick,
  onMarriageClick,
}: TreeCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);

  // ズーム Behavior の参照を保持 (フィットボタン等で再利用)
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // 現在の Transform を state で管理 (再レンダリングのトリガー用)
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);

  // ─── d3-zoom 初期化 ──────────────────────────────────────
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .on('zoom', (event) => {
        setTransform(event.transform);
      });

    select(svgEl).call(zoomBehavior);
    zoomBehaviorRef.current = zoomBehavior;

    // 初期フィット表示
    fitToView(svgEl, zoomBehavior, layout, false);

    return () => {
      select(svgEl).on('.zoom', null);
    };
    // d3-zoom のイベントリスナー登録は初回マウント時のみ行い、
    // layout 変更時の再フィットは別の useEffect (依存配列に layout を含む) で処理する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── フィット計算 ────────────────────────────────────────
  const fitToView = useCallback(
    (
      svgEl: SVGSVGElement,
      zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>,
      treeLayout: TreeLayout,
      animated: boolean
    ) => {
      const { width: svgW, height: svgH } = svgEl.getBoundingClientRect();
      if (svgW === 0 || svgH === 0) return;
      if (treeLayout.totalWidth === 0 || treeLayout.totalHeight === 0) return;

      const scaleX = (svgW - FIT_PADDING * 2) / treeLayout.totalWidth;
      const scaleY = (svgH - FIT_PADDING * 2) / treeLayout.totalHeight;
      const scale = Math.min(scaleX, scaleY, ZOOM_MAX);

      const tx = (svgW - treeLayout.totalWidth * scale) / 2;
      const ty = (svgH - treeLayout.totalHeight * scale) / 2;

      const target = zoomIdentity.translate(tx, ty).scale(scale);

      const selection = select(svgEl);
      if (animated) {
        selection.transition().duration(TRANSITION_DURATION).call(zoomBehavior.transform, target);
      } else {
        selection.call(zoomBehavior.transform, target);
      }
    },
    []
  );

  // ─── フィットボタンハンドラ ──────────────────────────────
  function handleFit() {
    const svgEl = svgRef.current;
    const zoomBehavior = zoomBehaviorRef.current;
    if (!svgEl || !zoomBehavior) return;
    fitToView(svgEl, zoomBehavior, layout, true);
  }

  // ─── レイアウト変更時に自動フィット ─────────────────────
  useEffect(() => {
    const svgEl = svgRef.current;
    const zoomBehavior = zoomBehaviorRef.current;
    if (!svgEl || !zoomBehavior) return;
    fitToView(svgEl, zoomBehavior, layout, false);
  }, [layout, fitToView]);

  // ─── ノードの分類 ────────────────────────────────────────
  const personNodes = layout.nodes.filter(
    (n): n is PersonNodeType => n.type === 'person'
  );
  const marriageNodes = layout.nodes.filter(
    (n): n is MarriageNodeType => n.type === 'marriage'
  );

  // ─── 描画 ────────────────────────────────────────────────
  return (
    <div className={styles.container}>
      <svg
        ref={svgRef}
        className={styles.svg}
        aria-label="家系図キャンバス"
        role="img"
      >
        <g
          ref={gRef}
          transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
        >
          {/* エッジ (ノードの下に描画) */}
          <g aria-hidden="true">
            {layout.edges.map((edge: TreeEdge) => (
              <EdgeLine key={edge.id} edge={edge} nodes={layout.nodes as HierarchyNode[]} />
            ))}
          </g>

          {/* 婚姻ノード */}
          <g>
            {marriageNodes.map((node) => (
              <MarriageNode
                key={node.id}
                node={node}
                onClick={onMarriageClick}
              />
            ))}
          </g>

          {/* 人物ノード (最前面) */}
          <g>
            {personNodes.map((node) => (
              <PersonNode
                key={node.id}
                node={node}
                onClick={onPersonClick}
              />
            ))}
          </g>
        </g>
      </svg>

      {/* ─── ツールバー ───────────────────────────── */}
      <div className={styles.toolbar} role="toolbar" aria-label="ズームコントロール">
        <button
          type="button"
          className={styles.toolbarButton}
          onClick={handleFit}
          aria-label="全体表示にフィット"
          title="全体表示にフィット"
        >
          <FitIcon />
        </button>

        <button
          type="button"
          className={styles.toolbarButton}
          onClick={() => {
            const svgEl = svgRef.current;
            const zoomBehavior = zoomBehaviorRef.current;
            if (!svgEl || !zoomBehavior) return;
            select(svgEl)
              .transition()
              .duration(TRANSITION_DURATION)
              .call(zoomBehavior.transform, zoomIdentity);
          }}
          aria-label="100%表示"
          title="100%表示 (リセット)"
        >
          <ResetIcon />
        </button>
      </div>

      {/* ズームレベル表示 */}
      <div className={styles.zoomLevel} aria-live="polite" aria-atomic="true">
        {Math.round(transform.k * 100)}%
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────
// アイコン (インライン SVG)
// ─────────────────────────────────────────────────────────

function FitIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}
