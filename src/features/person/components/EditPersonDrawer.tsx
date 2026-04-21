'use client';

/**
 * EditPersonDrawer
 *
 * 人物編集サイドパネル（右側からスライドインするドロワー）。
 * createPortal でオーバーレイを body に配置し、
 * 送信時に updatePerson Server Action を呼ぶ。
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useToast } from '@/components/ui';

import { updatePerson } from '../actions';
import type { Person } from '../actions';
import { PersonForm, PersonFormValues } from './PersonForm';

import styles from './EditPersonDrawer.module.css';

export interface EditPersonDrawerProps {
  open: boolean;
  onClose: () => void;
  person: Person;
}

export function EditPersonDrawer({ open, onClose, person }: EditPersonDrawerProps) {
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  /* Body scroll lock */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  /* Esc キーで閉じる */
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, isSubmitting]);

  /* 開いた時に閉じるボタンにフォーカス */
  useEffect(() => {
    if (open) {
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open]);

  const defaultValues: Partial<PersonFormValues> = {
    displayName: person.displayName,
    familyName: person.familyName,
    givenName: person.givenName,
    maidenName: person.maidenName,
    gender:
      person.gender === 'male' ||
      person.gender === 'female' ||
      person.gender === 'other' ||
      person.gender === 'unknown'
        ? person.gender
        : null,
    birthYear: person.birthYear,
    birthMonth: person.birthMonth,
    birthDay: person.birthDay,
    birthPlace: person.birthPlace,
    deathYear: person.deathYear,
    deathMonth: person.deathMonth,
    deathDay: person.deathDay,
    deathPlace: person.deathPlace,
    isAlive: person.isAlive,
    note: person.note,
  };

  const handleSubmit = async (values: PersonFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await updatePerson({
        personId: person.id,
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

      toast.success('人物情報を更新しました');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSubmitting && e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!open) return null;
  if (typeof window === 'undefined') return null;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={handleOverlayClick}
      aria-hidden={!open}
    >
      <div
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={`${person.displayName} を編集`}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>人物を編集</h2>
          <button
            ref={closeBtnRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <div className={styles.body}>
          <PersonForm
            key={person.id}
            defaultValues={defaultValues}
            onSubmit={handleSubmit}
            submitLabel="更新"
            isSubmitting={isSubmitting}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
