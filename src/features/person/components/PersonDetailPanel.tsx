'use client';

/**
 * PersonDetailPanel
 *
 * 人物詳細パネル。
 * - 基本情報（氏名・性別・生没年・出生地/死亡地）
 * - 代表写真表示
 * - 関連する関係一覧（親子・婚姻）
 * - 編集ボタン → EditPersonDrawer を開く
 * - 削除ボタン → インラインダイアログで確認後 deletePerson 呼び出し
 */

import React, { useState, useTransition } from 'react';

import { Button, useToast } from '@/components/ui';
import { formatPartialDate } from '@/lib/date/partial-date';
import type { PhotoSummary } from '@/features/photo/actions/get-photos';
import type { RelationRow } from '@/features/relation/actions';

import { deletePerson } from '../actions/delete-person';
import type { Person } from '../actions/get-person';
import { EditPersonDrawer } from './EditPersonDrawer';

import styles from './PersonDetailPanel.module.css';

export interface PersonDetailPanelProps {
  treeId: string;
  person: Person;
  photos: PhotoSummary[];
  relations: RelationRow[];
  onDeleted?: () => void;
}

/** 性別の表示ラベル */
function genderLabel(gender: string | null): string {
  switch (gender) {
    case 'male':
      return '男性';
    case 'female':
      return '女性';
    case 'other':
      return 'その他';
    case 'unknown':
      return '不明';
    default:
      return '未設定';
  }
}

/** 関係種別の表示ラベル */
function relationKindLabel(kind: RelationRow['kind']): string {
  return kind === 'parent_child' ? '親子関係' : '婚姻関係';
}

export function PersonDetailPanel({
  treeId,
  person,
  photos,
  relations,
  onDeleted,
}: PersonDetailPanelProps) {
  // treeId は将来的な削除後リダイレクト等で使用する想定
  void treeId;
  const toast = useToast();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 代表写真を探す
  const primaryPhoto =
    person.primaryPhotoId != null
      ? photos.find((p) => p.id === person.primaryPhotoId) ?? null
      : null;

  // この人物に関係する関係一覧（fromPersonId または toPersonId が person.id のもの）
  const personRelations = relations.filter(
    (r) => r.fromPersonId === person.id || r.toPersonId === person.id
  );

  const handleDeleteConfirm = () => {
    startTransition(async () => {
      const result = await deletePerson({ personId: person.id });
      if (!result.ok) {
        toast.error(result.error.message);
        setShowDeleteConfirm(false);
        return;
      }
      toast.success('人物を削除しました');
      setShowDeleteConfirm(false);
      onDeleted?.();
    });
  };

  const birthDate = formatPartialDate({
    year: person.birthYear,
    month: person.birthMonth,
    day: person.birthDay,
  });

  const deathDate = formatPartialDate({
    year: person.deathYear,
    month: person.deathMonth,
    day: person.deathDay,
  });

  return (
    <div className={styles.panel}>
      {/* 代表写真 */}
      {primaryPhoto && (
        <div className={styles.photoSection}>
          <div className={styles.photoWrapper}>
            {/* Storage の公開 URL は storageObjectKey から構成。
                MVPでは alt テキストのみのプレースホルダー表示でも可 */}
            <div className={styles.photoPlaceholder} aria-label="代表写真">
              <span className={styles.photoIcon} aria-hidden="true">🖼</span>
            </div>
          </div>
        </div>
      )}

      {/* 基本情報 */}
      <section className={styles.section} aria-labelledby="basic-info-heading">
        <h2 id="basic-info-heading" className={styles.sectionTitle}>
          基本情報
        </h2>

        {/* 氏名 */}
        <div className={styles.nameBlock}>
          <span className={styles.displayName}>{person.displayName}</span>
          {(person.familyName || person.givenName) && (
            <span className={styles.fullName}>
              {[person.familyName, person.givenName].filter(Boolean).join(' ')}
            </span>
          )}
          {person.maidenName && (
            <span className={styles.maidenName}>旧姓: {person.maidenName}</span>
          )}
        </div>

        {/* 詳細フィールド */}
        <dl className={styles.dl}>
          <div className={styles.dlRow}>
            <dt className={styles.dt}>性別</dt>
            <dd className={styles.dd}>{genderLabel(person.gender)}</dd>
          </div>

          {birthDate && (
            <div className={styles.dlRow}>
              <dt className={styles.dt}>生年月日</dt>
              <dd className={styles.dd}>{birthDate}</dd>
            </div>
          )}

          {person.birthPlace && (
            <div className={styles.dlRow}>
              <dt className={styles.dt}>出生地</dt>
              <dd className={styles.dd}>{person.birthPlace}</dd>
            </div>
          )}

          <div className={styles.dlRow}>
            <dt className={styles.dt}>存命</dt>
            <dd className={styles.dd}>{person.isAlive ? '存命中' : '故人'}</dd>
          </div>

          {!person.isAlive && deathDate && (
            <div className={styles.dlRow}>
              <dt className={styles.dt}>没年月日</dt>
              <dd className={styles.dd}>{deathDate}</dd>
            </div>
          )}

          {!person.isAlive && person.deathPlace && (
            <div className={styles.dlRow}>
              <dt className={styles.dt}>死亡地</dt>
              <dd className={styles.dd}>{person.deathPlace}</dd>
            </div>
          )}

          {person.note && (
            <div className={styles.dlRow}>
              <dt className={styles.dt}>メモ</dt>
              <dd className={`${styles.dd} ${styles.note}`}>{person.note}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* 関係一覧 */}
      {personRelations.length > 0 && (
        <section className={styles.section} aria-labelledby="relations-heading">
          <h2 id="relations-heading" className={styles.sectionTitle}>
            関係
          </h2>
          <ul className={styles.relationList} role="list">
            {personRelations.map((rel) => {
              const isFrom = rel.fromPersonId === person.id;
              const partnerId = isFrom ? rel.toPersonId : rel.fromPersonId;
              return (
                <li key={rel.id} className={styles.relationItem}>
                  <span className={styles.relationKind}>
                    {relationKindLabel(rel.kind)}
                  </span>
                  <span className={styles.relationPartner}>
                    {rel.kind === 'parent_child'
                      ? isFrom
                        ? `親 → ${partnerId.slice(0, 8)}…`
                        : `子 ← ${partnerId.slice(0, 8)}…`
                      : `相手: ${partnerId.slice(0, 8)}…`}
                  </span>
                  {rel.note && (
                    <span className={styles.relationNote}>{rel.note}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* アクションボタン */}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          onClick={() => setIsEditOpen(true)}
          disabled={isPending}
        >
          編集
        </Button>
        <Button
          variant="danger"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={isPending}
        >
          削除
        </Button>
      </div>

      {/* インライン削除確認UI */}
      {showDeleteConfirm && (
        <div
          className={styles.deleteConfirm}
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="delete-confirm-title"
          aria-describedby="delete-confirm-desc"
        >
          <p id="delete-confirm-title" className={styles.deleteConfirmTitle}>
            削除の確認
          </p>
          <p id="delete-confirm-desc" className={styles.deleteConfirmDesc}>
            この人物を削除しますか？この操作は取り消せません。
          </p>
          <div className={styles.deleteConfirmActions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeleteConfirm}
              loading={isPending}
              disabled={isPending}
            >
              削除する
            </Button>
          </div>
        </div>
      )}

      {/* 編集ドロワー */}
      <EditPersonDrawer
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        person={person}
      />
    </div>
  );
}
