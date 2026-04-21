'use client';

/**
 * TreeSettingsForm
 *
 * ツリー設定画面でタイトル・説明を編集するフォーム。
 * react-hook-form + zodResolver でバリデーションを行う。
 * 成功時は Toast で「保存しました」を表示する。
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button, FormError, FormField, FormLabel, Input, useToast } from '@/components/ui';
import { updateTree } from '@/features/tree/actions/update-tree';

import styles from './TreeSettingsForm.module.css';

/** フォーム用スキーマ（treeId はフォーム内では不要なため除外） */
const treeSettingsFormSchema = z.object({
  title: z
    .string({ required_error: 'タイトルを入力してください' })
    .min(1, { message: 'タイトルを入力してください' })
    .max(100, { message: 'タイトルは100文字以内で入力してください' }),
  description: z
    .string()
    .max(500, { message: '説明は500文字以内で入力してください' })
    .optional(),
});

type TreeSettingsFormValues = z.infer<typeof treeSettingsFormSchema>;

export interface TreeSettingsFormProps {
  treeId: string;
  defaultValues: {
    title: string;
    description: string | null;
  };
}

export function TreeSettingsForm({ treeId, defaultValues }: TreeSettingsFormProps) {
  const toast = useToast();
  const descriptionId = useId();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TreeSettingsFormValues>({
    resolver: zodResolver(treeSettingsFormSchema),
    defaultValues: {
      title: defaultValues.title,
      description: defaultValues.description ?? '',
    },
  });

  const handleFormSubmit = handleSubmit(async (values) => {
    try {
      const result = await updateTree({
        treeId,
        title: values.title,
        description: values.description ?? null,
      });

      if (!result.ok) {
        const { error } = result;
        if (error.field === 'title') {
          setError('title', { message: error.message });
        } else if (error.field === 'description') {
          setError('description', { message: error.message });
        } else {
          setError('root', { message: error.message });
        }
        return;
      }

      toast.success('保存しました');
    } catch {
      setError('root', { message: '保存に失敗しました。もう一度お試しください。' });
    }
  });

  return (
    <form onSubmit={handleFormSubmit} className={styles.form} noValidate>
      {errors.root && (
        <div className={styles.rootError} role="alert">
          {errors.root.message}
        </div>
      )}

      <FormField>
        <FormLabel htmlFor="settings-title" required>
          タイトル
        </FormLabel>
        <Input
          id="settings-title"
          {...register('title')}
          placeholder="例: 田中家の家系図"
          maxLength={100}
          error={errors.title?.message}
          aria-required="true"
        />
      </FormField>

      <FormField>
        <FormLabel htmlFor={descriptionId}>説明（任意）</FormLabel>
        <textarea
          id={descriptionId}
          {...register('description')}
          placeholder="この家系図についての説明を入力してください"
          maxLength={500}
          className={[
            styles.textarea,
            errors.description ? styles.textareaError : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? `${descriptionId}-error` : undefined}
          rows={5}
        />
        <FormError id={`${descriptionId}-error`} message={errors.description?.message} />
      </FormField>

      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          保存する
        </Button>
      </div>
    </form>
  );
}
