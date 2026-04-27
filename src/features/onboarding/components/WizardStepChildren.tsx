'use client';

/**
 * WizardStepChildren
 *
 * オンボーディングウィザード ステップ3: 子を追加する（0〜N名・スキップ可）。
 * PersonForm を使い、quickAddRelative('child') Server Action で即時保存する。
 * 1人追加するたびにリストに表示し、「完了」で次へ進む。
 *
 * スキップ操作はヘッダーのスキップボタン（OnboardingWizard 側）で行う。
 * このコンポーネント内にはスキップボタンを持たない。
 */

import React, { useState } from 'react';

import { Button, useToast } from '@/components/ui';
import { PersonForm, PersonFormValues } from '@/features/person/components/PersonForm';
import { quickAddRelative } from '@/features/relation/actions/quick-add-relative';

import styles from './WizardStep.module.css';

interface ChildEntry {
  personId: string;
  displayName: string;
}

interface WizardStepChildrenProps {
  originPersonId: string;
  onComplete: () => void;
}

export function WizardStepChildren({
  originPersonId,
  onComplete,
}: WizardStepChildrenProps) {
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [addedChildren, setAddedChildren] = useState<ChildEntry[]>([]);

  const handleSubmit = async (values: PersonFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await quickAddRelative({
        originPersonId,
        kind: 'child',
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

      setAddedChildren((prev) => [
        ...prev,
        { personId: result.data.personId, displayName: values.displayName },
      ]);
      setShowForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepDescription}>
        <p className={styles.descriptionText}>
          子どもを追加しますか？複数人追加できます。後から追加することもできます。
        </p>
      </div>

      {addedChildren.length > 0 && (
        <div className={styles.addedList}>
          <p className={styles.addedListLabel}>追加した子ども</p>
          <ul className={styles.addedListItems}>
            {addedChildren.map((child) => (
              <li key={child.personId} className={styles.addedListItem}>
                <span className={styles.addedIcon} aria-hidden="true">✓</span>
                {child.displayName}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showForm ? (
        <PersonForm
          onSubmit={handleSubmit}
          submitLabel="追加"
          isSubmitting={isSubmitting}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <div className={styles.choiceActions}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowForm(true)}
          >
            {addedChildren.length === 0 ? '子どもを追加する' : 'さらに追加する'}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onComplete}
          >
            {addedChildren.length === 0 ? '子を追加せずに完了' : '完了'}
          </Button>
        </div>
      )}
    </div>
  );
}
