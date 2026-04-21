'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { Button, FormField, FormLabel, Input, Modal } from '@/components/ui';
import { deleteTree } from '@/features/tree/actions/delete-tree';

import styles from './DeleteTreeModal.module.css';

export interface DeleteTreeModalCounts {
  persons: number;
  photos: number;
}

interface DeleteTreeModalProps {
  isOpen: boolean;
  onClose: () => void;
  treeId: string;
  treeTitle: string;
  counts: DeleteTreeModalCounts;
}

/**
 * ツリー削除確認モーダル — Client Component
 *
 * - 削除されるデータの概要（人物 N 名、写真 N 枚）を表示
 * - カスケード削除の範囲を箇条書きで表示
 * - ツリータイトルを入力させて完全一致確認（case-sensitive）
 * - deleteTree Server Action を呼び出し、成功時に /dashboard へ遷移
 */
export function DeleteTreeModal({
  isOpen,
  onClose,
  treeId,
  treeTitle,
  counts,
}: DeleteTreeModalProps) {
  const router = useRouter();
  const confirmInputId = useId();

  const [confirmValue, setConfirmValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);

  const isConfirmed =
    confirmValue.trim() !== '' && confirmValue.trim() === treeTitle.trim();

  const handleClose = () => {
    if (isSubmitting) return;
    setConfirmValue('');
    setRootError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!isConfirmed) return;

    setRootError(null);
    setIsSubmitting(true);

    try {
      const result = await deleteTree({ treeId });

      if (!result.ok) {
        setRootError(result.error.message);
        return;
      }

      // 成功時: モーダルを閉じてダッシュボードへ遷移
      onClose();
      router.push('/dashboard');
    } catch {
      setRootError('ツリーの削除に失敗しました。もう一度お試しください。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="家系図を削除"
      size="md"
      closeOnOverlayClick={!isSubmitting}
    >
      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        {/* 削除対象データのサマリ */}
        <section className={styles.summarySection} aria-label="削除されるデータ">
          <h3 className={styles.summaryHeading}>削除されるデータ</h3>
          <dl className={styles.summaryList}>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryLabel}>人物</dt>
              <dd className={styles.summaryValue}>{counts.persons} 名</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryLabel}>写真</dt>
              <dd className={styles.summaryValue}>{counts.photos} 枚</dd>
            </div>
          </dl>
        </section>

        {/* カスケード削除の範囲 */}
        <section className={styles.cascadeSection} aria-label="削除される内容の詳細">
          <p className={styles.cascadeHeading}>以下のすべてが完全に削除されます:</p>
          <ul className={styles.cascadeList}>
            <li>人物情報（氏名・生没年・メモ等）</li>
            <li>親子・婚姻などの関係情報</li>
            <li>写真ファイルおよびメタデータ</li>
            <li>共有リンク（発行済みの URL を含む）</li>
          </ul>
          <p className={styles.cascadeWarning}>この操作は取り消せません。</p>
        </section>

        {/* タイトル確認入力 */}
        <FormField>
          <FormLabel htmlFor={confirmInputId} required>
            確認のため、ツリーのタイトルを入力してください
          </FormLabel>
          <p className={styles.confirmHint}>
            タイトル:{' '}
            <strong className={styles.confirmTitleDisplay}>{treeTitle}</strong>
          </p>
          <Input
            id={confirmInputId}
            name="confirmTitle"
            type="text"
            placeholder={treeTitle}
            value={confirmValue}
            onChange={(e) => setConfirmValue(e.target.value)}
            disabled={isSubmitting}
            autoComplete="off"
            aria-describedby={`${confirmInputId}-hint`}
          />
          <p id={`${confirmInputId}-hint`} className={styles.inputHint}>
            タイトルと完全に一致する場合のみ削除できます
          </p>
        </FormField>

        {/* サーバーエラー */}
        {rootError && (
          <div className={styles.rootError} role="alert">
            {rootError}
          </div>
        )}

        {/* アクション */}
        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={!isConfirmed}
            loading={isSubmitting}
          >
            削除する
          </Button>
        </div>
      </form>
    </Modal>
  );
}
