'use client';

import { useState } from 'react';

import { Button } from '@/components/ui';

import { DeleteTreeModal, type DeleteTreeModalCounts } from './DeleteTreeModal';
import styles from './DeleteTreeSection.module.css';

interface DeleteTreeSectionProps {
  treeId: string;
  treeTitle: string;
  counts: DeleteTreeModalCounts;
}

/**
 * 「ツリーを削除」ボタン + DeleteTreeModal を一体管理する Client Component。
 * Server Component (settings/page.tsx) から利用する。
 * CreateTreeButton のパターンに準拠。
 */
export function DeleteTreeSection({
  treeId,
  treeTitle,
  counts,
}: DeleteTreeSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className={styles.dangerZone}>
        <div className={styles.dangerDescription}>
          <p className={styles.dangerTitle}>この家系図を削除</p>
          <p className={styles.dangerText}>
            ツリーに含まれるすべての人物・関係・写真・共有リンクが完全に削除されます。
            この操作は取り消せません。
          </p>
        </div>
        <Button
          type="button"
          variant="danger"
          size="md"
          onClick={() => setIsModalOpen(true)}
        >
          ツリーを削除
        </Button>
      </div>

      <DeleteTreeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        treeId={treeId}
        treeTitle={treeTitle}
        counts={counts}
      />
    </>
  );
}
