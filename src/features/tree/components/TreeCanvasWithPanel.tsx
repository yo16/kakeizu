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
 * - 選択中のノードを SVG 上でハイライト表示（selected クラスを付与）
 * - NodeDetailPanel へ selectedNode・onClose・データを渡す
 *
 * Note: 実際の SVG ツリー描画は別タスク (fvp.1/fvp.2) で実装する想定のため、
 * このコンポーネントでは仮のノード一覧 UI を提供する。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import type { Person } from '@/features/person/actions/get-person';
import type { PhotoSummary } from '@/features/photo/actions/get-photos';
import type { RelationRow } from '@/features/relation/actions';

import { NodeDetailPanel } from './NodeDetailPanel';
import type { NodeKind, SelectedNode } from '../types';

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

export function TreeCanvasWithPanel({
  treeId,
  persons,
  photos,
  relations,
}: TreeCanvasWithPanelProps) {
  void treeId;

  const router = useRouter();
  const searchParams = useSearchParams();

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode]);

  // ノードクリックハンドラ
  const handlePersonNodeClick = useCallback((personId: string) => {
    setSelectedNode({ id: personId, kind: 'person' });
  }, []);

  const handleMarriageNodeClick = useCallback((relationId: string) => {
    setSelectedNode({ id: relationId, kind: 'marriage' });
  }, []);

  // パネルを閉じる
  const handleClose = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // 婚姻関係のみ抽出（marriage kind）
  const marriageRelations = relations.filter((r) => r.kind === 'marriage');

  return (
    <div className={styles.container}>
      {/* ツリーキャンバス領域 */}
      <div className={styles.canvas} aria-label="家系図キャンバス">
        {/* 人物ノード一覧（仮実装: SVGツリーが実装されるまでのリスト表示） */}
        <div className={styles.nodeList}>
          <h2 className={styles.nodeListTitle}>人物</h2>
          {persons.length === 0 && (
            <p className={styles.emptyMessage}>人物が登録されていません。</p>
          )}
          {persons.map((person) => {
            const isSelected =
              selectedNode?.kind === 'person' && selectedNode.id === person.id;
            return (
              <button
                key={person.id}
                type="button"
                className={`${styles.personNode} ${isSelected ? styles.personNodeSelected : ''}`}
                onClick={() => handlePersonNodeClick(person.id)}
                aria-pressed={isSelected}
                aria-label={`${person.displayName}${person.birthYear ? ` (${person.birthYear})` : ''} の詳細を開く`}
              >
                <span className={styles.personNodeAvatar} aria-hidden="true">
                  {person.gender === 'male' ? '👨' : person.gender === 'female' ? '👩' : '👤'}
                </span>
                <span className={styles.personNodeName}>{person.displayName}</span>
                {person.birthYear && (
                  <span className={styles.personNodeYear}>{person.birthYear}</span>
                )}
                {!person.isAlive && (
                  <span className={styles.personNodeDagger} aria-label="故人">†</span>
                )}
              </button>
            );
          })}
        </div>

        {/* 婚姻ノード一覧（仮実装） */}
        {marriageRelations.length > 0 && (
          <div className={styles.nodeList}>
            <h2 className={styles.nodeListTitle}>婚姻関係</h2>
            {marriageRelations.map((rel) => {
              const fromPerson = persons.find((p) => p.id === rel.fromPersonId);
              const toPerson = persons.find((p) => p.id === rel.toPersonId);
              const isSelected =
                selectedNode?.kind === 'marriage' && selectedNode.id === rel.id;

              return (
                <button
                  key={rel.id}
                  type="button"
                  className={`${styles.marriageNode} ${isSelected ? styles.marriageNodeSelected : ''}`}
                  onClick={() => handleMarriageNodeClick(rel.id)}
                  aria-pressed={isSelected}
                  aria-label={`${fromPerson?.displayName ?? '不明'} と ${toPerson?.displayName ?? '不明'} の婚姻関係`}
                >
                  <span className={styles.marriageNodeIcon} aria-hidden="true">💍</span>
                  <span className={styles.marriageNodeNames}>
                    {fromPerson?.displayName ?? '不明'} ＆ {toPerson?.displayName ?? '不明'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
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
