'use client';

/**
 * TreeCanvasWithPanel
 *
 * ツリーキャンバスと NodeDetailPanel を統合するクライアントコンポーネント。
 *
 * 責務:
 * - ノード選択状態 (selectedNode) を useState で管理
 * - URL クエリ (?node={id}&nodeKind={kind}) と selectedNode を同期
 *   - 初回マウント時に SearchParams を読み取り、初期選択状態を設定
 *   - ノード選択時に router.replace() で URL を更新（履歴は残さない）
 *   - パネルを閉じると ?node / ?nodeKind を削除
 * - PersonNode / MarriageNode のクリックで selectedNode を更新
 * - 選択中のノードを SVG 上でハイライト表示（selectedId を TreeCanvas に渡す）
 * - NodeDetailPanel へ selectedNode・onClose・データを渡す
 * - buildTreeLayout で persons/relations からレイアウトを生成し TreeCanvas に渡す
 *
 * Note: 代表写真の next/image 表示は仮実装コメントで保留 (fvp.5 以降で対応予定)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/Button/Button';
import { ExportModal } from '@/features/export/components/ExportModal';
import type { Person } from '@/features/person/actions/get-person';
import type { PhotoSummary } from '@/features/photo/actions/get-photos';
import type { RelationRow } from '@/features/relation/actions';
import { QuickAddRelativeModal } from '@/features/relation/components';

import { buildTreeLayout } from '../lib/buildTreeLayout';
import { computeYearRange } from '../lib/compute-year-range';
import { useTreeEditorStore } from '../state/tree-editor-store';
import type { PersonForLayout, PersonNodePhoto, RelationForLayout, NodeKind, SelectedNode } from '../types';
import type { RelativeKind } from './NodeQuickActions';

import { NodeDetailPanel } from './NodeDetailPanel';
import { TimelineSlider } from './TimelineSlider';
import { TreeCanvas } from './TreeCanvas';

import styles from './TreeCanvasWithPanel.module.css';

export interface TreeCanvasWithPanelProps {
  treeId: string;
  /** ツリータイトル (エクスポート時のファイル名に使用) */
  treeTitle?: string | null;
  persons: Person[];
  photos: PhotoSummary[];
  relations: RelationRow[];
  /**
   * personId ごとの写真一覧 (URL 解決済み)。
   * page.tsx (Server Component) で構築してここに渡す。
   * 未指定の場合はノードへの写真注入を行わない。
   */
  photosByPersonId?: Record<string, PersonNodePhoto[]>;
}

/** SearchParams から SelectedNode を復元する */
function resolveInitialNode(
  nodeParam: string | null,
  nodeKindParam: string | null
): SelectedNode | null {
  if (!nodeParam) return null;
  if (nodeKindParam === 'person' || nodeKindParam === 'marriage') {
    return { id: nodeParam, kind: nodeKindParam as NodeKind };
  }
  // nodeKind が省略された場合は person として扱う
  return { id: nodeParam, kind: 'person' };
}

/**
 * Person (camelCase) を PersonForLayout (snake_case) に変換する。
 */
function toPersonForLayout(person: Person): PersonForLayout {
  return {
    id: person.id,
    birth_year: person.birthYear,
    display_name: person.displayName,
    death_year: person.deathYear,
    primary_photo_url: null, // TODO: fvp.5 以降で primaryPhotoId から URL を解決する
  };
}

/**
 * RelationRow を RelationForLayout に変換する。
 * RelationRow.marriageType / marriageStatus はフリーテキスト可能なため、
 * RelationForLayout の union 型に合わせてキャストする。
 */
function toRelationForLayout(relation: RelationRow): RelationForLayout {
  return {
    id: relation.id,
    kind: relation.kind,
    fromPersonId: relation.fromPersonId,
    toPersonId: relation.toPersonId,
    startYear: relation.startYear,
    marriageStatus: relation.marriageStatus as RelationForLayout['marriageStatus'],
    marriageType: relation.marriageType as RelationForLayout['marriageType'],
    parentRole: relation.parentRole as RelationForLayout['parentRole'],
  };
}

/**
 * 選択ノードから TreeCanvas に渡す selectedId を生成する。
 * - person の場合: person.id そのまま
 * - marriage の場合: "marriage:{relation.id}" の形式 (buildTreeLayout の命名規則に準拠)
 */
function toSelectedId(selectedNode: SelectedNode | null): string | undefined {
  if (!selectedNode) return undefined;
  if (selectedNode.kind === 'marriage') {
    return `marriage:${selectedNode.id}`;
  }
  return selectedNode.id;
}

export function TreeCanvasWithPanel({
  treeId,
  treeTitle,
  persons,
  photos,
  relations,
  photosByPersonId,
}: TreeCanvasWithPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // treeId は将来の SearchParams 同期（ディープリンク等）で活用予定
  // 現時点ではページ側で取得済みのデータを受け取るため直接は使用しない
  void treeId;

  // persons から年範囲を計算して Zustand store に設定する
  const setYearRange = useTreeEditorStore((s) => s.setYearRange);
  useEffect(() => {
    const range = computeYearRange(
      persons.map((p) => ({
        birthYear: p.birthYear,
        deathYear: p.deathYear,
        isAlive: p.isAlive,
      }))
    );
    setYearRange(range);
  }, [persons, setYearRange]);

  // 初回マウント時に URL クエリから選択状態を復元
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(() => {
    const nodeParam = searchParams.get('node');
    const nodeKindParam = searchParams.get('nodeKind');
    return resolveInitialNode(nodeParam, nodeKindParam);
  });

  // 近接ボタンモーダル状態
  const [quickAddState, setQuickAddState] = useState<{
    open: boolean;
    originPersonId: string;
    kind: RelativeKind;
    selectedSpouseId?: string;
  } | null>(null);

  // エクスポートモーダル開閉状態
  const [isExportOpen, setIsExportOpen] = useState(false);

  // エクスポート対象 (キャンバスラッパ) への ref
  const canvasRef = useRef<HTMLDivElement>(null);

  // selectedNode の変化を URL クエリに反映（履歴は残さない）
  useEffect(() => {
    const currentParams = new URLSearchParams(Array.from(searchParams.entries()));

    if (selectedNode) {
      currentParams.set('node', selectedNode.id);
      currentParams.set('nodeKind', selectedNode.kind);
    } else {
      currentParams.delete('node');
      currentParams.delete('nodeKind');
    }

    const newUrl = currentParams.toString()
      ? `?${currentParams.toString()}`
      : window.location.pathname;

    router.replace(newUrl, { scroll: false });
  // searchParams は依存配列から除外（selectedNode 変化時のみ URL を更新する意図）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode]);

  // ノードクリックハンドラ
  const handlePersonNodeClick = useCallback((personId: string) => {
    setSelectedNode({ id: personId, kind: 'person' });
  }, []);

  const handleMarriageNodeClick = useCallback((relationId: string) => {
    // TreeCanvas から渡される marriageId は "marriage:{relationId}" 形式
    // SelectedNode.id は relation.id のみ保持する（NodeDetailPanel の検索キーに合わせる）
    const rawId = relationId.startsWith('marriage:')
      ? relationId.slice('marriage:'.length)
      : relationId;
    setSelectedNode({ id: rawId, kind: 'marriage' });
  }, []);

  // パネルを閉じる
  const handleClose = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // 近接ボタンクリック → QuickAddRelativeModal を開く
  const handlePersonQuickAdd = useCallback(
    (originPersonId: string, kind: RelativeKind, spouseId?: string) => {
      setQuickAddState({
        open: true,
        originPersonId,
        kind,
        selectedSpouseId: spouseId,
      });
    },
    []
  );

  // QuickAddRelativeModal を閉じる
  const handleQuickAddClose = useCallback(() => {
    setQuickAddState(null);
  }, []);

  // persons / relations を PersonForLayout / RelationForLayout に変換してレイアウトを計算
  // photosByPersonId が渡されている場合は各 PersonNode に photos を注入する
  const layout = useMemo(() => {
    const personsForLayout: PersonForLayout[] = persons.map(toPersonForLayout);
    const relationsForLayout: RelationForLayout[] = relations.map(toRelationForLayout);
    const baseLayout = buildTreeLayout(personsForLayout, relationsForLayout);

    if (!photosByPersonId) {
      return baseLayout;
    }

    // PersonNode に photos を注入する (buildTreeLayout は photos を知らないため、ここで付与)
    const nodesWithPhotos = baseLayout.nodes.map((node) => {
      if (node.type !== 'person') {
        return node;
      }
      const personPhotos = photosByPersonId[node.id];
      if (!personPhotos || personPhotos.length === 0) {
        return node;
      }
      return { ...node, photos: personPhotos };
    });

    return { ...baseLayout, nodes: nodesWithPhotos };
  }, [persons, relations, photosByPersonId]);

  // SVG ハイライト用に selectedId を生成
  const selectedId = toSelectedId(selectedNode);

  return (
    <div className={styles.container}>
      {/* キャンバス + タイムライン縦積みラッパ */}
      <div className={styles.canvasColumn}>
        {/* ツリーキャンバス領域 */}
        <div ref={canvasRef} className={styles.canvas} aria-label="家系図キャンバス">
          <Button
            variant="secondary"
            size="sm"
            className={styles.exportButton}
            onClick={() => setIsExportOpen(true)}
          >
            エクスポート
          </Button>
          <TreeCanvas
            layout={layout}
            onPersonClick={handlePersonNodeClick}
            onMarriageClick={handleMarriageNodeClick}
            selectedId={selectedId}
            onPersonQuickAdd={handlePersonQuickAdd}
            persons={persons}
            relations={relations}
          />
        </div>

        {/* タイムラインスライダー (画面下部) */}
        <TimelineSlider />
      </div>

      {/* ノード詳細パネル */}
      <NodeDetailPanel
        selectedNode={selectedNode}
        onClose={handleClose}
        persons={persons}
        photos={photos}
        relations={relations}
      />

      {/* 近接ボタン → 新規人物追加モーダル */}
      {quickAddState && (
        <QuickAddRelativeModal
          open={quickAddState.open}
          onClose={handleQuickAddClose}
          originPersonId={quickAddState.originPersonId}
          kind={quickAddState.kind}
          selectedSpouseId={quickAddState.selectedSpouseId}
        />
      )}

      {/* エクスポートモーダル */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        getTargetElement={() => canvasRef.current?.querySelector('svg') ?? null}
        treeTitle={treeTitle}
      />
    </div>
  );
}
