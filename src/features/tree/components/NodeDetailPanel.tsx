'use client';

/**
 * NodeDetailPanel
 *
 * ツリーキャンバス上のノードをクリックした際に右側からスライドインする詳細パネル。
 * - 人物ノード: 氏名・生没年・メモ・写真有無・編集ボタン
 * - 婚姻ノード: 配偶者名・婚姻種別・期間・編集ボタン
 * - パネル外クリック（オーバーレイ）で閉じる
 * - CSS transition でスライドインアニメーション
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { formatPartialDate } from '@/lib/date/partial-date';
import type { Person } from '@/features/person/actions/get-person';
import type { PhotoSummary } from '@/features/photo/actions/get-photos';
import type { RelationRow } from '@/features/relation/actions';
import { Button } from '@/components/ui';
import { EditPersonDrawer } from '@/features/person/components/EditPersonDrawer';

import type { SelectedNode } from '../types';

import styles from './NodeDetailPanel.module.css';

export interface NodeDetailPanelProps {
  /** 選択中ノード。null のときパネルを閉じる */
  selectedNode: SelectedNode | null;
  /** パネルを閉じるコールバック */
  onClose: () => void;
  /** ツリー内の全人物 */
  persons: Person[];
  /** ツリー内の全写真 */
  photos: PhotoSummary[];
  /** ツリー内の全関係 */
  relations: RelationRow[];
}

// ---------------------------------------------------------------------------
// 婚姻種別の表示ラベル
// ---------------------------------------------------------------------------
function marriageTypeLabel(marriageType: string | null): string {
  switch (marriageType) {
    case 'legal':
      return '法律婚';
    case 'common_law':
      return '事実婚';
    case 'same_sex_partner':
      return '同性パートナー';
    default:
      return '婚姻';
  }
}

// ---------------------------------------------------------------------------
// 婚姻ステータスの表示ラベル
// ---------------------------------------------------------------------------
function marriageStatusLabel(status: string | null): string {
  switch (status) {
    case 'current':
      return '婚姻中';
    case 'divorced':
      return '離婚';
    case 'widowed':
      return '死別';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// PersonNode 用コンテンツ
// ---------------------------------------------------------------------------
interface PersonNodeContentProps {
  person: Person;
  photos: PhotoSummary[];
  relations: RelationRow[];
  persons: Person[];
}

function PersonNodeContent({ person, photos, relations, persons }: PersonNodeContentProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);

  const primaryPhoto =
    person.primaryPhotoId != null
      ? photos.find((p) => p.id === person.primaryPhotoId) ?? null
      : null;

  // この人物の写真（personIds に含まれる）
  const personPhotos = photos.filter((p) => p.personIds.includes(person.id));

  // 関係一覧
  const personRelations = relations.filter(
    (r) => r.fromPersonId === person.id || r.toPersonId === person.id
  );

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
    <>
      {/* 代表写真 */}
      {primaryPhoto && (
        <div className={styles.photoSection}>
          <div className={styles.photoWrapper} aria-label="代表写真">
            <span className={styles.photoIcon} aria-hidden="true">🖼</span>
          </div>
        </div>
      )}

      {/* 氏名 */}
      <div className={styles.nameBlock}>
        <span className={styles.displayName}>{person.displayName}</span>
        {(person.familyName || person.givenName) && (
          <span className={styles.subName}>
            {[person.familyName, person.givenName].filter(Boolean).join(' ')}
          </span>
        )}
        {person.maidenName && (
          <span className={styles.subName}>旧姓: {person.maidenName}</span>
        )}
      </div>

      {/* 基本情報 */}
      <dl className={styles.dl}>
        {birthDate && (
          <div className={styles.dlRow}>
            <dt className={styles.dt}>生年月日</dt>
            <dd className={styles.dd}>{birthDate}</dd>
          </div>
        )}
        {!person.isAlive && deathDate && (
          <div className={styles.dlRow}>
            <dt className={styles.dt}>没年月日</dt>
            <dd className={styles.dd}>{deathDate}</dd>
          </div>
        )}
        {person.birthPlace && (
          <div className={styles.dlRow}>
            <dt className={styles.dt}>出生地</dt>
            <dd className={styles.dd}>{person.birthPlace}</dd>
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

      {/* 写真一覧（簡易） */}
      {personPhotos.length > 0 && (
        <section className={styles.section} aria-labelledby="panel-photos-heading">
          <h3 id="panel-photos-heading" className={styles.sectionTitle}>
            写真 ({personPhotos.length})
          </h3>
          <div className={styles.photoList}>
            {personPhotos.slice(0, 6).map((photo) => (
              <div
                key={photo.id}
                className={styles.photoThumb}
                aria-label={photo.caption ?? '写真'}
              >
                <span className={styles.photoThumbIcon} aria-hidden="true">🖼</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 関係 */}
      {personRelations.length > 0 && (
        <section className={styles.section} aria-labelledby="panel-relations-heading">
          <h3 id="panel-relations-heading" className={styles.sectionTitle}>
            関係
          </h3>
          <ul className={styles.relationList} role="list">
            {personRelations.map((rel) => {
              const isFrom = rel.fromPersonId === person.id;
              const partnerId = isFrom ? rel.toPersonId : rel.fromPersonId;
              const partner = persons.find((p) => p.id === partnerId);
              const partnerName = partner?.displayName ?? partnerId.slice(0, 8) + '…';

              return (
                <li key={rel.id} className={styles.relationItem}>
                  <span className={styles.relationKind}>
                    {rel.kind === 'parent_child' ? '親子' : '婚姻'}
                  </span>
                  <span className={styles.relationPartner}>
                    {rel.kind === 'parent_child'
                      ? isFrom
                        ? `親 → ${partnerName}`
                        : `子 ← ${partnerName}`
                      : partnerName}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 編集ボタン */}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => setIsEditOpen(true)}>
          編集
        </Button>
      </div>

      {/* 編集ドロワー */}
      <EditPersonDrawer
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        person={person}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// MarriageNode 用コンテンツ
// ---------------------------------------------------------------------------
interface MarriageNodeContentProps {
  relation: RelationRow;
  persons: Person[];
}

function MarriageNodeContent({ relation, persons }: MarriageNodeContentProps) {
  const fromPerson = persons.find((p) => p.id === relation.fromPersonId);
  const toPerson = persons.find((p) => p.id === relation.toPersonId);

  const startDate = formatPartialDate({
    year: relation.startYear,
    month: relation.startMonth,
  });
  const endDate = formatPartialDate({
    year: relation.endYear,
    month: relation.endMonth,
  });

  const statusLabel = marriageStatusLabel(relation.marriageStatus);
  const typeLabel = marriageTypeLabel(relation.marriageType);

  return (
    <>
      <div className={styles.nameBlock}>
        <span className={styles.displayName}>婚姻関係</span>
      </div>

      <dl className={styles.dl}>
        <div className={styles.dlRow}>
          <dt className={styles.dt}>配偶者1</dt>
          <dd className={styles.dd}>{fromPerson?.displayName ?? '（不明）'}</dd>
        </div>
        <div className={styles.dlRow}>
          <dt className={styles.dt}>配偶者2</dt>
          <dd className={styles.dd}>{toPerson?.displayName ?? '（不明）'}</dd>
        </div>
        <div className={styles.dlRow}>
          <dt className={styles.dt}>種別</dt>
          <dd className={styles.dd}>{typeLabel}</dd>
        </div>
        {statusLabel && (
          <div className={styles.dlRow}>
            <dt className={styles.dt}>状態</dt>
            <dd className={styles.dd}>{statusLabel}</dd>
          </div>
        )}
        {startDate && (
          <div className={styles.dlRow}>
            <dt className={styles.dt}>婚姻開始</dt>
            <dd className={styles.dd}>{startDate}</dd>
          </div>
        )}
        {endDate && (
          <div className={styles.dlRow}>
            <dt className={styles.dt}>婚姻終了</dt>
            <dd className={styles.dd}>{endDate}</dd>
          </div>
        )}
        {relation.note && (
          <div className={styles.dlRow}>
            <dt className={styles.dt}>メモ</dt>
            <dd className={`${styles.dd} ${styles.note}`}>{relation.note}</dd>
          </div>
        )}
      </dl>
    </>
  );
}

// ---------------------------------------------------------------------------
// NodeDetailPanel 本体
// ---------------------------------------------------------------------------
export function NodeDetailPanel({
  selectedNode,
  onClose,
  persons,
  photos,
  relations,
}: NodeDetailPanelProps) {
  const isOpen = selectedNode !== null;
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // 開いた時に閉じるボタンへフォーカス
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => closeBtnRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Esc キーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // body スクロールロック
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (typeof window === 'undefined') return null;

  // 選択ノードに対応するデータを解決する
  const person =
    selectedNode?.kind === 'person'
      ? persons.find((p) => p.id === selectedNode.id) ?? null
      : null;

  const marriageRelation =
    selectedNode?.kind === 'marriage'
      ? relations.find((r) => r.id === selectedNode.id) ?? null
      : null;

  const panelLabel =
    selectedNode?.kind === 'person'
      ? (person?.displayName ?? '人物') + ' の詳細'
      : '婚姻関係の詳細';

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <>
      {/* オーバーレイ（パネル外クリックで閉じる） */}
      <div
        className={`${styles.overlay} ${isOpen ? styles.overlayVisible : ''}`}
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* パネル本体 */}
      <div
        className={`${styles.panel} ${isOpen ? styles.panelOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={panelLabel}
        aria-hidden={!isOpen}
      >
        {/* ヘッダー */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            {selectedNode?.kind === 'person' ? '人物詳細' : '婚姻詳細'}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="パネルを閉じる"
          >
            ✕
          </button>
        </div>

        {/* ボディ */}
        <div className={styles.body}>
          {selectedNode?.kind === 'person' && person && (
            <PersonNodeContent
              person={person}
              photos={photos}
              relations={relations}
              persons={persons}
            />
          )}
          {selectedNode?.kind === 'person' && !person && (
            <p className={styles.notFound}>人物が見つかりませんでした。</p>
          )}
          {selectedNode?.kind === 'marriage' && marriageRelation && (
            <MarriageNodeContent
              relation={marriageRelation}
              persons={persons}
            />
          )}
          {selectedNode?.kind === 'marriage' && !marriageRelation && (
            <p className={styles.notFound}>婚姻情報が見つかりませんでした。</p>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
