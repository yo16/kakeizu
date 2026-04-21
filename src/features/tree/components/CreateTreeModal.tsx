'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

import { Button, FormError, FormField, FormLabel, Input, Modal } from '@/components/ui';
import { createTree } from '@/features/tree/actions/create-tree';
import { treeCreateSchema } from '@/features/tree/schemas';

import styles from './CreateTreeModal.module.css';

interface FieldErrors {
  title?: string;
  description?: string;
  root?: string;
}

interface CreateTreeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateTreeModal({ isOpen, onClose }: CreateTreeModalProps) {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();

  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPlanLimitExceeded, setIsPlanLimitExceeded] = useState(false);

  const handleClose = () => {
    if (isSubmitting) return;
    setErrors({});
    setIsPlanLimitExceeded(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const input = {
      title: formData.get('title'),
      description: formData.get('description') || undefined,
    };

    // クライアントサイドバリデーション
    const parsed = treeCreateSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const err of parsed.error.errors) {
        const field = err.path[0]?.toString() as keyof FieldErrors | undefined;
        if (field === 'title' || field === 'description') {
          fieldErrors[field] = err.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setIsPlanLimitExceeded(false);
    setIsSubmitting(true);

    try {
      const result = await createTree(parsed.data);

      if (!result.ok) {
        const { error } = result;
        if (error.code === 'PLAN_LIMIT_EXCEEDED') {
          setIsPlanLimitExceeded(true);
        } else if (error.field === 'title') {
          setErrors({ title: error.message });
        } else if (error.field === 'description') {
          setErrors({ description: error.message });
        } else {
          setErrors({ root: error.message });
        }
        return;
      }

      // 成功時: モーダルを閉じてツリー編集画面へ遷移
      onClose();
      router.push(`/trees/${result.data.treeId}`);
    } catch {
      setErrors({ root: 'ツリーの作成に失敗しました。もう一度お試しください。' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="新しい家系図を作成" size="md">
      {isPlanLimitExceeded ? (
        <div className={styles.planLimitMessage} role="alert">
          <p className={styles.planLimitTitle}>上限に達しました</p>
          <p className={styles.planLimitDescription}>
            現在のプランで作成できる家系図の上限に達しました。
            プランをアップグレードすると、さらに多くの家系図を作成できます。
          </p>
          <div className={styles.planLimitActions}>
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
            >
              閉じる
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                handleClose();
                router.push('/account/billing');
              }}
            >
              プランを確認する
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          {errors.root && (
            <div className={styles.rootError} role="alert">
              {errors.root}
            </div>
          )}

          <FormField>
            <FormLabel htmlFor={titleId} required>
              タイトル
            </FormLabel>
            <Input
              ref={titleRef}
              id={titleId}
              name="title"
              type="text"
              placeholder="例: 田中家の家系図"
              maxLength={100}
              required
              error={errors.title}
              aria-describedby={errors.title ? `${titleId}-error` : undefined}
            />
            {errors.title && (
              <FormError message={errors.title} id={`${titleId}-error`} />
            )}
          </FormField>

          <FormField>
            <FormLabel htmlFor={descriptionId}>
              説明（任意）
            </FormLabel>
            <textarea
              ref={descriptionRef}
              id={descriptionId}
              name="description"
              placeholder="この家系図についての説明を入力してください"
              maxLength={500}
              className={[
                styles.textarea,
                errors.description ? styles.textareaError : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={
                errors.description ? `${descriptionId}-error` : undefined
              }
              rows={4}
            />
            {errors.description && (
              <FormError
                message={errors.description}
                id={`${descriptionId}-error`}
              />
            )}
          </FormField>

          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              キャンセル
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              作成する
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
