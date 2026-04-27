'use client';

/**
 * WizardStepSpouse
 *
 * オンボーディングウィザード ステップ2: 配偶者を追加する（任意・スキップ可）。
 * PersonForm を使い、quickAddRelative('spouse') Server Action で即時保存する。
 */

import React, { useState } from 'react';

import { Button, useToast } from '@/components/ui';
import { PersonForm, PersonFormValues } from '@/features/person/components/PersonForm';
import { quickAddRelative } from '@/features/relation/actions/quick-add-relative';

import styles from './WizardStep.module.css';

interface WizardStepSpouseProps {
  originPersonId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export function WizardStepSpouse({ originPersonId, onComplete, onSkip }: WizardStepSpouseProps) {
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = async (values: PersonFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await quickAddRelative({
        originPersonId,
        kind: 'spouse',
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

      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!showForm) {
    return (
      <div className={styles.stepContent}>
        <div className={styles.stepDescription}>
          <p className={styles.descriptionText}>
            配偶者（パートナー）を追加しますか？後から追加することもできます。
          </p>
        </div>
        <div className={styles.choiceActions}>
          <Button
            type="button"
            variant="primary"
            onClick={() => setShowForm(true)}
          >
            配偶者を追加する
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onSkip}
          >
            配偶者を追加せずに次へ
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepDescription}>
        <p className={styles.descriptionText}>
          配偶者の情報を入力してください。
        </p>
      </div>
      <PersonForm
        onSubmit={handleSubmit}
        submitLabel="追加して次へ"
        isSubmitting={isSubmitting}
        onCancel={onSkip}
      />
    </div>
  );
}
