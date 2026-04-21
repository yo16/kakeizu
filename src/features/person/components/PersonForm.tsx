'use client';

/**
 * PersonForm
 *
 * 人物の新規作成・編集で共通利用するフォームコンポーネント。
 * react-hook-form + zodResolver でバリデーションを行う。
 */

import React from 'react';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button, Input, FormField, FormLabel, FormError } from '@/components/ui';

import styles from './PersonForm.module.css';

// フォーム用スキーマ（createPersonSchema から treeId を除いたもの）
const personFormSchema = z
  .object({
    displayName: z
      .string({ required_error: '名前を入力してください' })
      .min(1, { message: '名前を入力してください' })
      .max(200, { message: '名前は200文字以内で入力してください' }),
    familyName: z
      .string()
      .max(100, { message: '姓は100文字以内で入力してください' })
      .nullable()
      .optional(),
    givenName: z
      .string()
      .max(100, { message: '名は100文字以内で入力してください' })
      .nullable()
      .optional(),
    maidenName: z
      .string()
      .max(100, { message: '旧姓は100文字以内で入力してください' })
      .nullable()
      .optional(),
    gender: z
      .enum(['male', 'female', 'other', 'unknown'])
      .nullable()
      .optional(),
    birthYear: z.number().int().min(1000).max(9999).nullable().optional(),
    birthMonth: z.number().int().min(1).max(12).nullable().optional(),
    birthDay: z.number().int().min(1).max(31).nullable().optional(),
    birthPlace: z
      .string()
      .max(200, { message: '出生地は200文字以内で入力してください' })
      .nullable()
      .optional(),
    deathYear: z.number().int().min(1000).max(9999).nullable().optional(),
    deathMonth: z.number().int().min(1).max(12).nullable().optional(),
    deathDay: z.number().int().min(1).max(31).nullable().optional(),
    deathPlace: z
      .string()
      .max(200, { message: '死亡地は200文字以内で入力してください' })
      .nullable()
      .optional(),
    isAlive: z.boolean().optional(),
    note: z
      .string()
      .max(5000, { message: 'メモは5000文字以内で入力してください' })
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    // 年なしで月/日のみ入力はNG（birth）
    if (data.birthYear == null && (data.birthMonth != null || data.birthDay != null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '生年月日は年から順に入力してください',
        path: ['birthMonth'],
      });
    }
    if (data.birthYear != null && data.birthMonth == null && data.birthDay != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '日を入力する場合は月も入力してください',
        path: ['birthDay'],
      });
    }
    // 年なしで月/日のみ入力はNG（death）
    if (data.deathYear == null && (data.deathMonth != null || data.deathDay != null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '没年月日は年から順に入力してください',
        path: ['deathMonth'],
      });
    }
    if (data.deathYear != null && data.deathMonth == null && data.deathDay != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '日を入力する場合は月も入力してください',
        path: ['deathDay'],
      });
    }
  });

export type PersonFormValues = z.infer<typeof personFormSchema>;

export interface PersonFormProps {
  defaultValues?: Partial<PersonFormValues>;
  onSubmit: (values: PersonFormValues) => Promise<void>;
  submitLabel?: string;
  isSubmitting?: boolean;
  onCancel?: () => void;
}

/** number | null | undefined の input value 変換 */
function numberToInputValue(v: number | null | undefined): string {
  if (v == null) return '';
  return String(v);
}

/** input の文字列を number | null に変換 */
function inputValueToNumber(v: string): number | null {
  const trimmed = v.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return isNaN(n) ? null : n;
}

export function PersonForm({
  defaultValues,
  onSubmit,
  submitLabel = '保存',
  isSubmitting = false,
  onCancel,
}: PersonFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PersonFormValues>({
    resolver: zodResolver(personFormSchema),
    defaultValues: {
      displayName: '',
      familyName: null,
      givenName: null,
      maidenName: null,
      gender: null,
      birthYear: null,
      birthMonth: null,
      birthDay: null,
      birthPlace: null,
      deathYear: null,
      deathMonth: null,
      deathDay: null,
      deathPlace: null,
      isAlive: true,
      note: null,
      ...defaultValues,
    },
  });

  const isAlive = useWatch({ control, name: 'isAlive' });

  const handleFormSubmit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <form onSubmit={handleFormSubmit} className={styles.form} noValidate>
      {/* 表示名 */}
      <FormField>
        <FormLabel htmlFor="displayName" required>
          表示名
        </FormLabel>
        <Input
          id="displayName"
          {...register('displayName')}
          placeholder="例: 田中 太郎"
          error={errors.displayName?.message}
          aria-required="true"
        />
      </FormField>

      {/* 氏名（姓・名・旧姓） */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>氏名</legend>
        <div className={styles.row}>
          <FormField className={styles.rowItem}>
            <FormLabel htmlFor="familyName">姓</FormLabel>
            <Input
              id="familyName"
              {...register('familyName')}
              placeholder="田中"
              error={errors.familyName?.message}
            />
          </FormField>
          <FormField className={styles.rowItem}>
            <FormLabel htmlFor="givenName">名</FormLabel>
            <Input
              id="givenName"
              {...register('givenName')}
              placeholder="太郎"
              error={errors.givenName?.message}
            />
          </FormField>
        </div>
        <FormField>
          <FormLabel htmlFor="maidenName">旧姓</FormLabel>
          <Input
            id="maidenName"
            {...register('maidenName')}
            placeholder="旧姓（省略可）"
            error={errors.maidenName?.message}
          />
        </FormField>
      </fieldset>

      {/* 性別 */}
      <FormField>
        <FormLabel htmlFor="gender">性別</FormLabel>
        <Controller
          name="gender"
          control={control}
          render={({ field }) => (
            <select
              id="gender"
              className={styles.select}
              value={field.value ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                field.onChange(v === '' ? null : v);
              }}
            >
              <option value="">未設定</option>
              <option value="male">男性</option>
              <option value="female">女性</option>
              <option value="other">その他</option>
              <option value="unknown">不明</option>
            </select>
          )}
        />
        <FormError message={errors.gender?.message} />
      </FormField>

      {/* 生年月日 */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>生年月日</legend>
        <div className={styles.dateRow}>
          <Controller
            name="birthYear"
            control={control}
            render={({ field }) => (
              <FormField className={styles.dateYear}>
                <FormLabel htmlFor="birthYear">年</FormLabel>
                <Input
                  id="birthYear"
                  type="number"
                  placeholder="1980"
                  min={1000}
                  max={9999}
                  value={numberToInputValue(field.value)}
                  onChange={(e) => field.onChange(inputValueToNumber(e.target.value))}
                  error={errors.birthYear?.message}
                />
              </FormField>
            )}
          />
          <Controller
            name="birthMonth"
            control={control}
            render={({ field }) => (
              <FormField className={styles.dateMonthDay}>
                <FormLabel htmlFor="birthMonth">月</FormLabel>
                <Input
                  id="birthMonth"
                  type="number"
                  placeholder="1"
                  min={1}
                  max={12}
                  value={numberToInputValue(field.value)}
                  onChange={(e) => field.onChange(inputValueToNumber(e.target.value))}
                  error={errors.birthMonth?.message}
                />
              </FormField>
            )}
          />
          <Controller
            name="birthDay"
            control={control}
            render={({ field }) => (
              <FormField className={styles.dateMonthDay}>
                <FormLabel htmlFor="birthDay">日</FormLabel>
                <Input
                  id="birthDay"
                  type="number"
                  placeholder="1"
                  min={1}
                  max={31}
                  value={numberToInputValue(field.value)}
                  onChange={(e) => field.onChange(inputValueToNumber(e.target.value))}
                  error={errors.birthDay?.message}
                />
              </FormField>
            )}
          />
        </div>
      </fieldset>

      {/* 出生地 */}
      <FormField>
        <FormLabel htmlFor="birthPlace">出生地</FormLabel>
        <Input
          id="birthPlace"
          {...register('birthPlace')}
          placeholder="例: 東京都"
          error={errors.birthPlace?.message}
        />
      </FormField>

      {/* 存命フラグ */}
      <FormField>
        <label className={styles.checkboxLabel}>
          <Controller
            name="isAlive"
            control={control}
            render={({ field }) => (
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={field.value ?? true}
                onChange={(e) => field.onChange(e.target.checked)}
              />
            )}
          />
          存命中
        </label>
      </FormField>

      {/* 没年月日（isAlive = false のときのみ表示） */}
      {!isAlive && (
        <>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>没年月日</legend>
            <div className={styles.dateRow}>
              <Controller
                name="deathYear"
                control={control}
                render={({ field }) => (
                  <FormField className={styles.dateYear}>
                    <FormLabel htmlFor="deathYear">年</FormLabel>
                    <Input
                      id="deathYear"
                      type="number"
                      placeholder="2020"
                      min={1000}
                      max={9999}
                      value={numberToInputValue(field.value)}
                      onChange={(e) => field.onChange(inputValueToNumber(e.target.value))}
                      error={errors.deathYear?.message}
                    />
                  </FormField>
                )}
              />
              <Controller
                name="deathMonth"
                control={control}
                render={({ field }) => (
                  <FormField className={styles.dateMonthDay}>
                    <FormLabel htmlFor="deathMonth">月</FormLabel>
                    <Input
                      id="deathMonth"
                      type="number"
                      placeholder="1"
                      min={1}
                      max={12}
                      value={numberToInputValue(field.value)}
                      onChange={(e) => field.onChange(inputValueToNumber(e.target.value))}
                      error={errors.deathMonth?.message}
                    />
                  </FormField>
                )}
              />
              <Controller
                name="deathDay"
                control={control}
                render={({ field }) => (
                  <FormField className={styles.dateMonthDay}>
                    <FormLabel htmlFor="deathDay">日</FormLabel>
                    <Input
                      id="deathDay"
                      type="number"
                      placeholder="1"
                      min={1}
                      max={31}
                      value={numberToInputValue(field.value)}
                      onChange={(e) => field.onChange(inputValueToNumber(e.target.value))}
                      error={errors.deathDay?.message}
                    />
                  </FormField>
                )}
              />
            </div>
          </fieldset>

          {/* 死亡地 */}
          <FormField>
            <FormLabel htmlFor="deathPlace">死亡地</FormLabel>
            <Input
              id="deathPlace"
              {...register('deathPlace')}
              placeholder="例: 東京都"
              error={errors.deathPlace?.message}
            />
          </FormField>
        </>
      )}

      {/* メモ */}
      <FormField>
        <FormLabel htmlFor="note">メモ</FormLabel>
        <textarea
          id="note"
          className={styles.textarea}
          {...register('note')}
          placeholder="自由記述（5000文字以内）"
          rows={4}
          aria-describedby={errors.note ? 'note-error' : undefined}
        />
        <FormError id="note-error" message={errors.note?.message} />
      </FormField>

      {/* アクションボタン */}
      <div className={styles.actions}>
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
