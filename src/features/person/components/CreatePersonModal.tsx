'use client';

/**
 * CreatePersonModal
 *
 * 新規人物追加モーダル。
 * Modal UI コンポーネントの内部に PersonForm を配置し、
 * 送信時に createPerson Server Action を呼ぶ。
 */

import React, { useState } from 'react';

import { Modal, useToast } from '@/components/ui';

import { createPerson } from '../actions';
import type { Person } from '../actions';
import { PersonForm, PersonFormValues } from './PersonForm';

import styles from './CreatePersonModal.module.css';

export interface CreatePersonModalProps {
  open: boolean;
  onClose: () => void;
  treeId: string;
  onSuccess?: (person: Person) => void;
}

export function CreatePersonModal({
  open,
  onClose,
  treeId,
  onSuccess,
}: CreatePersonModalProps) {
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: PersonFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await createPerson({
        treeId,
        displayName: values.displayName,
        familyName: values.familyName ?? null,
        givenName: values.givenName ?? null,
        maidenName: values.maidenName ?? null,
        gender: values.gender ?? null,
        birth:
          values.birthYear != null || values.birthMonth != null || values.birthDay != null
            ? {
                year: values.birthYear ?? null,
                month: values.birthMonth ?? null,
                day: values.birthDay ?? null,
              }
            : undefined,
        birthPlace: values.birthPlace ?? null,
        death:
          values.deathYear != null || values.deathMonth != null || values.deathDay != null
            ? {
                year: values.deathYear ?? null,
                month: values.deathMonth ?? null,
                day: values.deathDay ?? null,
              }
            : undefined,
        deathPlace: values.deathPlace ?? null,
        isAlive: values.isAlive ?? true,
        note: values.note ?? null,
      });

      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      toast.success('人物を追加しました');

      // 追加した人物の詳細を取得して onSuccess に渡す
      // createPerson は { personId } のみ返すため、
      // onSuccess が必要な場合は getPerson で取得する
      if (onSuccess) {
        const { getPerson } = await import('../actions');
        const personResult = await getPerson({ personId: result.data.personId });
        if (personResult.ok) {
          onSuccess(personResult.data);
        }
      }

      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="人物を追加"
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
