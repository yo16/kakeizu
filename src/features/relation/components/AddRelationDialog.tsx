'use client';

/**
 * AddRelationDialog
 *
 * 既存人物に関係を追加するダイアログ (FR-V5 近接ボタン等から起動)。
 * - 関係種別の選択 (radio)
 * - RelationForm を呼び出す
 * - persons は親から props で渡す（クライアントサイドフィルタリング）
 *
 * 使い方:
 *   <AddRelationDialog
 *     isOpen={open}
 *     onClose={() => setOpen(false)}
 *     treeId={treeId}
 *     fromPersonId={selectedPersonId}
 *     persons={persons}
 *     onSuccess={(relation) => { ... }}
 *   />
 */

import React, { useState, useEffect } from 'react';

import { Modal } from '@/components/ui/Modal/Modal';
import type { PersonSummary } from '@/features/person/actions';

import { RelationForm, type RelationResult } from './RelationForm';
import type { RelationFormProps } from './RelationForm';
import styles from './AddRelationDialog.module.css';

/* ------------------------------------------------------------------ */
/* 型定義                                                               */
/* ------------------------------------------------------------------ */

type RelationKind = 'parent_child' | 'marriage';

export interface AddRelationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  treeId: string;
  /** 関係の起点となる人物 ID（"自分"側） */
  fromPersonId: string;
  /** ツリー内人物一覧（クライアントサイドフィルタリング用） */
  persons: PersonSummary[];
  /** 関係作成成功時コールバック */
  onSuccess?: (relation: RelationResult) => void;
}

/* ------------------------------------------------------------------ */
/* AddRelationDialog — メインコンポーネント                            */
/* ------------------------------------------------------------------ */

export function AddRelationDialog({
  isOpen,
  onClose,
  treeId,
  fromPersonId,
  persons,
  onSuccess,
}: AddRelationDialogProps) {
  const [kind, setKind] = useState<RelationKind>('parent_child');

  // ダイアログを開くたびに種別をリセット
  useEffect(() => {
    if (isOpen) {
      setKind('parent_child');
    }
  }, [isOpen]);

  const handleSuccess = (relation: RelationResult) => {
    onSuccess?.(relation);
    onClose();
  };

  const formProps: RelationFormProps = {
    treeId,
    fromPersonId,
    persons,
    kind,
    mode: 'create',
    onSuccess: handleSuccess,
    onCancel: onClose,
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="関係を追加"
      size="md"
    >
      <div className={styles.content}>
        {/* 関係種別選択 */}
        <fieldset className={styles.kindFieldset}>
          <legend className={styles.kindLegend}>関係の種類</legend>
          <div className={styles.kindOptions}>
            <label className={[styles.kindOption, kind === 'parent_child' ? styles.kindOptionSelected : ''].filter(Boolean).join(' ')}>
              <input
                type="radio"
                name="addRelationKind"
                value="parent_child"
                checked={kind === 'parent_child'}
                onChange={() => setKind('parent_child')}
                className={styles.kindRadio}
              />
              <span className={styles.kindOptionContent}>
                <span className={styles.kindOptionIcon} aria-hidden="true">👥</span>
                <span className={styles.kindOptionLabel}>親子関係</span>
                <span className={styles.kindOptionDesc}>親と子の関係を登録します</span>
              </span>
            </label>
            <label className={[styles.kindOption, kind === 'marriage' ? styles.kindOptionSelected : ''].filter(Boolean).join(' ')}>
              <input
                type="radio"
                name="addRelationKind"
                value="marriage"
                checked={kind === 'marriage'}
                onChange={() => setKind('marriage')}
                className={styles.kindRadio}
              />
              <span className={styles.kindOptionContent}>
                <span className={styles.kindOptionIcon} aria-hidden="true">💍</span>
                <span className={styles.kindOptionLabel}>婚姻関係</span>
                <span className={styles.kindOptionDesc}>配偶者・パートナー関係を登録します</span>
              </span>
            </label>
          </div>
        </fieldset>

        {/* 関係フォーム */}
        <RelationForm key={kind} {...formProps} />
      </div>
    </Modal>
  );
}
