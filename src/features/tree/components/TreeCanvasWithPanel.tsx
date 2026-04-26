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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import type { Person } from '@/features/person/actions/get-person';
import type { PhotoSummary } from '@/features/photo/actions/get-photos';
import type { RelationRow } from '@/features/relation/actions';

import { buildTreeLayout } from '../lib/buildTreeLayout';
import type { PersonForLayout, RelationForLayout, NodeKind, SelectedNode } from '../types';

import { NodeDetailPanel } from './NodeDetailPanel';
import { TreeCanvas } from './TreeCanvas';

import styles from './TreeCanvasWithPanel.module.css';

export interface TreeCanvasWithPanelProps {
  treeId: string;
  persons: Person[];
  photos: PhotoSummary[];
  relations: RelationRow[];
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
  persons,
  photos,
  relations,
}: TreeCanvasWithPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // treeId は将来の SearchParams 同期（ディープリンク等）で活用予定
  // 現時点ではページ側で取得済みのデータを受け取るため直接は使用しない
  void treeId;

  // 初回マウント時に URL クエリから選択状態を復元
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(() => {
    const nodeParam = searchParams.get('node');
    const nodeKindParam = searchParams.get('nodeKind');
    return resolveInitialNode(nodeParam, nodeKindParam);
  });

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

  // persons / relations を PersonForLayout / RelationForLayout に変換してレイアウトを計算
  const layout = useMemo(() => {
    const personsForLayout: PersonForLayout[] = persons.map(toPersonForLayout);
    const relationsForLayout: RelationForLayout[] = relations.map(toRelationForLayout);
    return buildTreeLayout(personsForLayout, relationsForLayout);
  }, [persons, relations]);

  // SVG ハイライト用に selectedId を生成
  const selectedId = toSelectedId(selectedNode);

  return (
    <div className={styles.container}>
      {/* ツリーキャンバス領域 */}
      <div className={styles.canvas} aria-label="家系図キャンバス">
        <TreeCanvas
          layout={layout}
          onPersonClick={handlePersonNodeClick}
          onMarriageClick={handleMarriageNodeClick}
          selectedId={selectedId}
        />
      </div>

      {/* ノード詳細パネル */}
      <NodeDetailPanel
        selectedNode={selectedNode}
        onClose={handleClose}
        persons={persons}
        photos={photos}
        relations={relations}
      />
    </div>
  );
}
