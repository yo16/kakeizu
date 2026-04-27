'use client';

/**
 * WizardStepSelf
 *
 * オンボーディングウィザード ステップ1: 起点となる人物（自分）を登録する。
 * PersonForm を使い、createPerson Server Action で即時保存する。
 *
 * スキップ操作はヘッダーのスキップボタン（OnboardingWizard 側）で行う。
 * このコンポーネントは「次へ進む（保存）」のみを担当する。
 */

import React, { useState } from 'react';

import { useToast } from '@/components/ui';
import { createPerson } from '@/features/person/actions';
import { PersonForm, PersonFormValues } from '@/features/person/components/PersonForm';

import styles from './WizardStep.module.css';

interface WizardStepSelfProps {
  treeId: string;
  onComplete: (personId: string) => void;
}

export function WizardStepSelf({ treeId, onComplete }: WizardStepSelfProps) {
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

      onComplete(result.data.personId);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepDescription}>
        <p className={styles.descriptionText}>
          まず、あなた自身（または家系図の中心となる人物）の情報を入力してください。
        </p>
      </div>
      <PersonForm
        onSubmit={handleSubmit}
        submitLabel="次へ進む"
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
