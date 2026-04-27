'use client';

/**
 * QuickAddRelativeModal.tsx
 *
 * 近接ボタン (+親 / +子 / +配偶者) からトリガーされるモーダル。
 * PersonForm で情報を入力し、quickAddRelative Server Action を呼び出す。
 *
 * - kind に応じたタイトル表示
 * - 成功時: モーダルを閉じ、router.refresh() でツリーを再描画
 * - エラー時: トースト表示
 *
 * frontend-design.md §3 近接ボタン (FR-V5) に準拠。
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Modal, useToast } from '@/components/ui';
import { PersonForm, PersonFormValues } from '@/features/person/components/PersonForm';
import { quickAddRelative } from '../actions/quick-add-relative';
import type { RelativeKind } from '../../tree/components/NodeQuickActions';

import styles from './QuickAddRelativeModal.module.css';

export interface QuickAddRelativeModalProps {
  /** モーダルの開閉 */
  open: boolean;
  onClose: () => void;
  /** 起点となる person.id */
  originPersonId: string;
  /** 追加する関係の種類 */
  kind: RelativeKind;
  /**
   * +子 の場合のみ使用。
   * 複数配偶者がいる場合に選択された配偶者 ID。
   * undefined = 配偶者なし or 単独で子追加。
   */
  selectedSpouseId?: string;
}

/** kind から日本語タイトルを生成 */
function kindToTitle(kind: RelativeKind): string {
  switch (kind) {
    case 'parent':
      return '親を追加';
    case 'child':
      return '子を追加';
    case 'spouse':
      return '配偶者を追加';
  }
}

export function QuickAddRelativeModal({
  open,
  onClose,
  originPersonId,
  kind,
  selectedSpouseId,
}: QuickAddRelativeModalProps) {
  const router = useRouter();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: PersonFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await quickAddRelative({
        originPersonId,
        kind,
        // kind === 'child' かつ selectedSpouseId が指定されている場合のみ spousePersonId を渡す。
        // 空文字は「配偶者なし (未婚の子)」を意味するため undefined に変換する。
        ...(kind === 'child' && selectedSpouseId && selectedSpouseId.length > 0
          ? { spousePersonId: selectedSpouseId }
          : {}),
        personDraft: {
          displayName: values.displayName,
          familyName: values.familyName ?? null,
          givenName: values.givenName ?? null,
          maidenName: values.maidenName ?? null,
          gender: values.gender ?? null,
          birthYear: values.birthYear ?? null,
          birthMonth: values.birthMonth ?? null,
          birthDay: values.birthDay ?? null,
          birthPlace: values.birthPlace ?? null,
          deathYear: values.deathYear ?? null,
          deathMonth: values.deathMonth ?? null,
          deathDay: values.deathDay ?? null,
          deathPlace: values.deathPlace ?? null,
          isAlive: values.isAlive ?? true,
          note: values.note ?? null,
        },
      });

      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      const kindLabel =
        kind === 'parent' ? '親' : kind === 'child' ? '子' : '配偶者';
      toast.success(`${kindLabel}を追加しました`);
      onClose();
      // Server Component を再取得してツリーを更新
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={kindToTitle(kind)}
      size="lg"
      closeOnOverlayClick={!isSubmitting}
    >
      <div className={styles.container}>
        <PersonForm
          onSubmit={handleSubmit}
          submitLabel="追加"
          isSubmitting={isSubmitting}
          onCancel={onClose}
        />
      </div>
    </Modal>
  );
}
