'use client';

import React, { useState, useTransition } from 'react';
import Image from 'next/image';

import { Button, useToast } from '@/components/ui';
import { deletePhoto, linkPersonToPhoto, unlinkPersonFromPhoto, updatePhotoMeta } from '@/features/photo/actions';
import { setPrimaryPhoto } from '@/features/person/actions';

import styles from './PhotoDetailPanel.module.css';

export interface PhotoWithLinks {
  id: string;
  storageObjectKey: string;
  takenYear: number | null;
  takenMonth: number | null;
  takenDay: number | null;
  caption: string | null;
  personIds: string[];
}

export interface PhotoDetailPanelProps {
  treeId: string;
  photo: PhotoWithLinks;
  persons: Array<{ id: string; displayName: string }>;
  displayUrl: string;
  onClose: () => void;
  onDeleted?: () => void;
}

export function PhotoDetailPanel({
  treeId,
  photo,
  persons,
  displayUrl,
  onClose,
  onDeleted,
}: PhotoDetailPanelProps) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  // 撮影日 + キャプション フォーム state
  const [takenYear, setTakenYear] = useState<string>(
    photo.takenYear != null ? String(photo.takenYear) : ''
  );
  const [takenMonth, setTakenMonth] = useState<string>(
    photo.takenMonth != null ? String(photo.takenMonth) : ''
  );
  const [takenDay, setTakenDay] = useState<string>(
    photo.takenDay != null ? String(photo.takenDay) : ''
  );
  const [caption, setCaption] = useState<string>(photo.caption ?? '');
  const [metaError, setMetaError] = useState<string | null>(null);

  // 人物追加 select state
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [linkError, setLinkError] = useState<string | null>(null);

  // 代表写真設定 select state（紐付き人物が複数いる場合に使う）
  const [primaryTargetPersonId, setPrimaryTargetPersonId] = useState<string>('');
  const [primaryError, setPrimaryError] = useState<string | null>(null);

  // 削除確認 state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 現在リンク済み人物
  const linkedPersons = persons.filter((p) => photo.personIds.includes(p.id));
  // 未リンク人物
  const unlinkPersons = persons.filter((p) => !photo.personIds.includes(p.id));

  // 撮影日・キャプション保存
  const handleMetaSave = () => {
    setMetaError(null);
    startTransition(async () => {
      const result = await updatePhotoMeta({
        photoId: photo.id,
        takenYear: takenYear !== '' ? Number(takenYear) : null,
        takenMonth: takenMonth !== '' ? Number(takenMonth) : null,
        takenDay: takenDay !== '' ? Number(takenDay) : null,
        caption: caption !== '' ? caption : null,
      });
      if (!result.ok) {
        setMetaError(result.error.message);
        return;
      }
      toast.success('写真情報を保存しました');
    });
  };

  // 人物リンク追加
  const handleLinkPerson = () => {
    if (!selectedPersonId) return;
    setLinkError(null);
    startTransition(async () => {
      const result = await linkPersonToPhoto({
        photoId: photo.id,
        personId: selectedPersonId,
        treeId,
      });
      if (!result.ok) {
        setLinkError(result.error.message);
        return;
      }
      setSelectedPersonId('');
      toast.success('人物を紐付けました');
    });
  };

  // 人物リンク削除
  const handleUnlinkPerson = (personId: string) => {
    setLinkError(null);
    startTransition(async () => {
      const result = await unlinkPersonFromPhoto({ photoId: photo.id, personId });
      if (!result.ok) {
        setLinkError(result.error.message);
        return;
      }
      toast.success('人物の紐付けを解除しました');
    });
  };

  // 代表写真設定
  const handleSetPrimary = () => {
    // 紐付き人物が1人の場合はその人物へ、複数の場合は select から選ぶ
    const targetPersonId =
      linkedPersons.length === 1 ? linkedPersons[0].id : primaryTargetPersonId;
    if (!targetPersonId) return;
    setPrimaryError(null);
    startTransition(async () => {
      const result = await setPrimaryPhoto({ personId: targetPersonId, photoId: photo.id });
      if (!result.ok) {
        setPrimaryError(result.error.message);
        return;
      }
      toast.success('代表写真を設定しました');
    });
  };

  // 削除実行
  const handleDeleteConfirm = () => {
    startTransition(async () => {
      const result = await deletePhoto({ photoId: photo.id });
      if (!result.ok) {
        toast.error(result.error.message);
        setShowDeleteConfirm(false);
        return;
      }
      toast.success('写真を削除しました');
      setShowDeleteConfirm(false);
      onDeleted?.();
    });
  };

  return (
    <div className={styles.panel}>
      {/* ヘッダー */}
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>写真詳細</h2>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="パネルを閉じる"
        >
          ✕
        </button>
      </div>

      <div className={styles.body}>
        {/* サムネイル */}
        <section className={styles.section} aria-labelledby="thumbnail-heading">
          <h3 id="thumbnail-heading" className={styles.sectionTitle}>
            写真
          </h3>
          <div className={styles.thumbnailWrapper}>
            <Image
              src={displayUrl}
              alt={caption || '写真'}
              className={styles.thumbnail}
              width={480}
              height={320}
              unoptimized
              style={{ objectFit: 'contain' }}
            />
          </div>
        </section>

        {/* 撮影日・キャプション編集 */}
        <section className={styles.section} aria-labelledby="meta-heading">
          <h3 id="meta-heading" className={styles.sectionTitle}>
            撮影日・キャプション
          </h3>

          <div className={styles.dateRow}>
            <div className={styles.dateField}>
              <label htmlFor="taken-year" className={styles.fieldLabel}>年</label>
              <input
                id="taken-year"
                type="number"
                className={styles.numberInput}
                value={takenYear}
                onChange={(e) => setTakenYear(e.target.value)}
                placeholder="例: 1985"
                min={1}
                max={9999}
                disabled={isPending}
              />
            </div>
            <div className={styles.dateField}>
              <label htmlFor="taken-month" className={styles.fieldLabel}>月</label>
              <input
                id="taken-month"
                type="number"
                className={styles.numberInput}
                value={takenMonth}
                onChange={(e) => setTakenMonth(e.target.value)}
                placeholder="例: 3"
                min={1}
                max={12}
                disabled={isPending}
              />
            </div>
            <div className={styles.dateField}>
              <label htmlFor="taken-day" className={styles.fieldLabel}>日</label>
              <input
                id="taken-day"
                type="number"
                className={styles.numberInput}
                value={takenDay}
                onChange={(e) => setTakenDay(e.target.value)}
                placeholder="例: 15"
                min={1}
                max={31}
                disabled={isPending}
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="caption" className={styles.fieldLabel}>キャプション</label>
            <textarea
              id="caption"
              className={styles.textarea}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="写真の説明を入力"
              rows={3}
              disabled={isPending}
            />
          </div>

          {metaError && (
            <p className={styles.inlineError} role="alert">{metaError}</p>
          )}

          <div className={styles.actions}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleMetaSave}
              loading={isPending}
              disabled={isPending}
            >
              保存
            </Button>
          </div>
        </section>

        {/* 関連人物 */}
        <section className={styles.section} aria-labelledby="persons-heading">
          <h3 id="persons-heading" className={styles.sectionTitle}>
            関連人物
          </h3>

          {linkedPersons.length > 0 ? (
            <ul className={styles.personList} role="list">
              {linkedPersons.map((p) => (
                <li key={p.id} className={styles.personRow}>
                  <span className={styles.personName}>{p.displayName}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnlinkPerson(p.id)}
                    disabled={isPending}
                    aria-label={`${p.displayName} の紐付けを解除`}
                  >
                    削除
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyNote}>紐付けられた人物がいません</p>
          )}

          {unlinkPersons.length > 0 && (
            <div className={styles.addPersonRow}>
              <select
                className={styles.select}
                value={selectedPersonId}
                onChange={(e) => setSelectedPersonId(e.target.value)}
                disabled={isPending}
                aria-label="追加する人物を選択"
              >
                <option value="">人物を選択...</option>
                {unlinkPersons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleLinkPerson}
                disabled={isPending || !selectedPersonId}
              >
                追加
              </Button>
            </div>
          )}

          {linkError && (
            <p className={styles.inlineError} role="alert">{linkError}</p>
          )}
        </section>

        {/* 代表写真設定 */}
        <section className={styles.section} aria-labelledby="primary-heading">
          <h3 id="primary-heading" className={styles.sectionTitle}>
            代表写真に設定
          </h3>

          {linkedPersons.length === 0 && (
            <p className={styles.emptyNote}>人物を紐付けると代表写真として設定できます</p>
          )}

          {linkedPersons.length === 1 && (
            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSetPrimary}
                loading={isPending}
                disabled={isPending}
              >
                {linkedPersons[0].displayName} の代表写真に設定
              </Button>
            </div>
          )}

          {linkedPersons.length > 1 && (
            <div className={styles.addPersonRow}>
              <select
                className={styles.select}
                value={primaryTargetPersonId}
                onChange={(e) => setPrimaryTargetPersonId(e.target.value)}
                disabled={isPending}
                aria-label="代表写真として設定する人物を選択"
              >
                <option value="">人物を選択...</option>
                {linkedPersons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSetPrimary}
                disabled={isPending || !primaryTargetPersonId}
                loading={isPending}
              >
                代表写真に設定
              </Button>
            </div>
          )}

          {primaryError && (
            <p className={styles.inlineError} role="alert">{primaryError}</p>
          )}
        </section>

        {/* 削除 */}
        <section className={styles.section} aria-labelledby="delete-heading">
          <h3 id="delete-heading" className={styles.sectionTitle}>
            削除
          </h3>
          <div className={styles.actions}>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isPending}
            >
              この写真を削除
            </Button>
          </div>

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
                この写真を削除しますか？この操作は取り消せません。
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
        </section>
      </div>
    </div>
  );
}
