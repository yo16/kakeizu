'use client';

/**
 * RelationForm
 *
 * 関係の新規作成・編集で共通利用するフォームコンポーネント。
 * react-hook-form + zodResolver でバリデーションを行う。
 *
 * - kind='parent_child': parentRole セレクト
 * - kind='marriage': marriageType / marriageStatus セレクト + 年月入力
 * - toPersonId が未指定の場合: PersonSearchCombobox を表示
 * - mode='create': createParentChild / createMarriage を呼び出す
 * - mode='edit': updateRelation を呼び出す（defaultValues に relationId が必要）
 */

import React, { useId } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button, Input, FormField, FormLabel, FormError } from '@/components/ui';
import { useToast } from '@/components/ui/Toast/ToastProvider';

import {
  parentRoleSchema,
  marriageTypeSchema,
  marriageStatusSchema,
  type ParentRole,
  type MarriageType,
  type MarriageStatus,
} from '../schemas';
import { createParentChild, createMarriage, updateRelation } from '../actions';
import type { PersonSummary } from '@/features/person/actions';

import styles from './RelationForm.module.css';

/* ------------------------------------------------------------------ */
/* ラベル定数                                                           */
/* ------------------------------------------------------------------ */

export const PARENT_ROLE_LABELS: Record<ParentRole, string> = {
  biological: '生物学的親',
  adoptive: '養親',
  step: '継親',
};

export const MARRIAGE_TYPE_LABELS: Record<MarriageType, string> = {
  spouse: '配偶者',
  common_law: '事実婚',
  same_sex_partner: '同性パートナー',
};

export const MARRIAGE_STATUS_LABELS: Record<MarriageStatus, string> = {
  current: '現在',
  divorced: '離婚',
  widowed: '死別',
};

/* ------------------------------------------------------------------ */
/* フォームスキーマ                                                     */
/* ------------------------------------------------------------------ */

/** number | undefined の input 変換 */
function numberToInputValue(v: number | null | undefined): string {
  if (v == null) return '';
  return String(v);
}

/** input 文字列を number | null に変換 */
function inputValueToNumber(v: string): number | null {
  const trimmed = v.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return isNaN(n) ? null : n;
}

/** 年月バリデーション */
const yearSchema = z
  .number({ invalid_type_error: '数値で入力してください' })
  .int()
  .min(1000, { message: '1000年以降を入力してください' })
  .max(9999, { message: '9999年以前を入力してください' })
  .nullable()
  .optional();

const monthSchema = z
  .number({ invalid_type_error: '数値で入力してください' })
  .int()
  .min(1, { message: '1〜12 の範囲で入力してください' })
  .max(12, { message: '1〜12 の範囲で入力してください' })
  .nullable()
  .optional();

/** 親子関係フォームスキーマ */
const parentChildFormSchema = z.object({
  toPersonId: z.string().uuid({ message: '相手の人物を選択してください' }),
  parentRole: parentRoleSchema,
  note: z
    .string()
    .max(1000, { message: 'メモは1000文字以内で入力してください' })
    .nullable()
    .optional(),
});

/** 婚姻関係フォームスキーマ */
const marriageFormSchema = z
  .object({
    toPersonId: z.string().uuid({ message: '相手の人物を選択してください' }),
    marriageType: marriageTypeSchema,
    marriageStatus: marriageStatusSchema,
    startYear: yearSchema,
    startMonth: monthSchema,
    endYear: yearSchema,
    endMonth: monthSchema,
    note: z
      .string()
      .max(1000, { message: 'メモは1000文字以内で入力してください' })
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startYear && data.endYear && data.endYear < data.startYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '終了年は開始年以降を入力してください',
        path: ['endYear'],
      });
    }
  });

type ParentChildFormValues = z.infer<typeof parentChildFormSchema>;
type MarriageFormValues = z.infer<typeof marriageFormSchema>;

/* ------------------------------------------------------------------ */
/* Relation 返却型 (onSuccess コールバック用)                          */
/* ------------------------------------------------------------------ */

export interface RelationResult {
  relationId?: string;
  kind: 'parent_child' | 'marriage';
}

/* ------------------------------------------------------------------ */
/* Props                                                                */
/* ------------------------------------------------------------------ */

export interface RelationFormProps {
  treeId: string;
  fromPersonId: string;
  /** 指定済みなら相手選択フィールドを非表示にする */
  toPersonId?: string;
  /** ツリー内人物一覧（クライアントサイドフィルタリング用） */
  persons: PersonSummary[];
  kind: 'parent_child' | 'marriage';
  defaultValues?: {
    relationId?: string;
    parentRole?: ParentRole;
    marriageType?: MarriageType;
    marriageStatus?: MarriageStatus;
    startYear?: number | null;
    startMonth?: number | null;
    endYear?: number | null;
    endMonth?: number | null;
    note?: string | null;
    toPersonId?: string;
  };
  onSuccess?: (relation: RelationResult) => void;
  onCancel?: () => void;
  mode?: 'create' | 'edit';
}

/* ------------------------------------------------------------------ */
/* PersonSearchCombobox — 人物検索・選択（インライン）                 */
/* ------------------------------------------------------------------ */

interface PersonSearchComboboxProps {
  persons: PersonSummary[];
  excludeId?: string;
  value: string;
  onChange: (id: string) => void;
  label: string;
  error?: string;
  required?: boolean;
}

function PersonSearchCombobox({
  persons,
  excludeId,
  value,
  onChange,
  label,
  error,
  required,
}: PersonSearchComboboxProps) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const comboboxId = useId();
  const listboxId = useId();

  const selectedPerson = persons.find((p) => p.id === value);

  const filtered = persons
    .filter((p) => {
      if (p.id === excludeId) return false;
      const q = query.toLowerCase();
      return p.displayName.toLowerCase().includes(q);
    })
    .slice(0, 20);

  const handleSelect = (person: PersonSummary) => {
    onChange(person.id);
    setQuery(person.displayName);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    onChange('');
    setOpen(true);
  };

  const handleInputFocus = () => {
    if (!value) setOpen(true);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const first = listRef.current?.querySelector<HTMLElement>('[role="option"]');
      first?.focus();
    }
  };

  const handleOptionKeyDown = (e: React.KeyboardEvent<HTMLLIElement>, person: PersonSummary) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(person);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (e.currentTarget.nextElementSibling as HTMLElement | null);
      next?.focus();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (e.currentTarget.previousElementSibling as HTMLElement | null);
      if (prev) {
        prev.focus();
      } else {
        inputRef.current?.focus();
      }
    }
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.focus();
    }
  };

  // 外側クリックでリスト閉じる
  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.closest(`.${styles.combobox}`)?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // 選択済み時はクエリ欄に名前を表示
  React.useEffect(() => {
    if (selectedPerson) {
      setQuery(selectedPerson.displayName);
    }
  }, [selectedPerson]);

  return (
    <div className={styles.combobox}>
      <FormField>
        <FormLabel htmlFor={comboboxId} required={required}>
          {label}
        </FormLabel>
        <Input
          ref={inputRef}
          id={comboboxId}
          type="text"
          placeholder="名前で検索..."
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleInputKeyDown}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-required={required}
          error={error}
        />
      </FormField>
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={label}
          className={styles.comboboxList}
        >
          {filtered.map((p) => (
            <li
              key={p.id}
              role="option"
              aria-selected={p.id === value}
              className={[
                styles.comboboxOption,
                p.id === value ? styles.comboboxOptionSelected : '',
              ]
                .filter(Boolean)
                .join(' ')}
              tabIndex={0}
              onClick={() => handleSelect(p)}
              onKeyDown={(e) => handleOptionKeyDown(e, p)}
            >
              <span className={styles.comboboxOptionName}>{p.displayName}</span>
              {p.birthYear && (
                <span className={styles.comboboxOptionMeta}>{p.birthYear}年生</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && query.length > 0 && filtered.length === 0 && (
        <div className={styles.comboboxEmpty}>該当する人物が見つかりません</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* RelationForm — 親子関係フォーム                                     */
/* ------------------------------------------------------------------ */

function ParentChildForm({
  treeId,
  fromPersonId,
  toPersonId,
  persons,
  defaultValues,
  onSuccess,
  onCancel,
  mode,
}: RelationFormProps) {
  const toast = useToast();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ParentChildFormValues>({
    resolver: zodResolver(parentChildFormSchema),
    defaultValues: {
      toPersonId: toPersonId ?? defaultValues?.toPersonId ?? '',
      parentRole: defaultValues?.parentRole ?? 'biological',
      note: defaultValues?.note ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (mode === 'edit' && defaultValues?.relationId) {
      const result = await updateRelation({
        kind: 'parent_child',
        relationId: defaultValues.relationId,
        parentRole: values.parentRole,
        note: values.note ?? null,
      });
      if (!result.ok) {
        if (result.error.field) {
          setError(result.error.field as keyof ParentChildFormValues, {
            message: result.error.message,
          });
        } else {
          setError('root', { message: result.error.message });
          toast.error(result.error.message ?? '更新に失敗しました');
        }
        return;
      }
      toast.success('更新しました');
      onSuccess?.({ kind: 'parent_child' });
    } else {
      const result = await createParentChild({
        parentId: fromPersonId,
        childId: values.toPersonId,
        parentRole: values.parentRole,
        note: values.note ?? undefined,
      });
      if (!result.ok) {
        if (result.error.field) {
          setError(result.error.field as keyof ParentChildFormValues, {
            message: result.error.message,
          });
        } else {
          setError('root', { message: result.error.message });
          toast.error(result.error.message ?? '追加に失敗しました');
        }
        return;
      }
      toast.success('追加しました');
      onSuccess?.({ relationId: result.data.relationId, kind: 'parent_child' });
    }
  });

  const showToPersonSelect = !toPersonId;

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
      {/* 相手の人物選択 */}
      {showToPersonSelect && (
        <Controller
          name="toPersonId"
          control={control}
          render={({ field }) => (
            <PersonSearchCombobox
              persons={persons}
              excludeId={fromPersonId}
              value={field.value}
              onChange={field.onChange}
              label="子（相手の人物）"
              error={errors.toPersonId?.message}
              required
            />
          )}
        />
      )}

      {/* 親の役割 */}
      <FormField>
        <FormLabel htmlFor="parentRole" required>
          親の役割
        </FormLabel>
        <Controller
          name="parentRole"
          control={control}
          render={({ field }) => (
            <select
              id="parentRole"
              className={styles.select}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value as ParentRole)}
            >
              {(Object.entries(PARENT_ROLE_LABELS) as [ParentRole, string][]).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          )}
        />
        <FormError message={errors.parentRole?.message} />
      </FormField>

      {/* メモ */}
      <FormField>
        <FormLabel htmlFor="parentChildNote">メモ</FormLabel>
        <textarea
          id="parentChildNote"
          className={styles.textarea}
          {...register('note')}
          placeholder="自由記述（1000文字以内）"
          rows={3}
          aria-describedby={errors.note ? 'parentChildNote-error' : undefined}
        />
        <FormError id="parentChildNote-error" message={errors.note?.message} />
      </FormField>

      {/* ルートエラー */}
      {errors.root && <FormError message={errors.root.message} />}

      {/* ボタン */}
      <div className={styles.actions}>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            キャンセル
          </Button>
        )}
        <Button type="submit" variant="primary" loading={isSubmitting} disabled={isSubmitting}>
          {mode === 'edit' ? '更新する' : '追加する'}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* RelationForm — 婚姻関係フォーム                                     */
/* ------------------------------------------------------------------ */

function MarriageForm({
  fromPersonId,
  toPersonId,
  persons,
  defaultValues,
  onSuccess,
  onCancel,
  mode,
}: RelationFormProps) {
  const toast = useToast();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MarriageFormValues>({
    resolver: zodResolver(marriageFormSchema),
    defaultValues: {
      toPersonId: toPersonId ?? defaultValues?.toPersonId ?? '',
      marriageType: defaultValues?.marriageType ?? 'spouse',
      marriageStatus: defaultValues?.marriageStatus ?? 'current',
      startYear: defaultValues?.startYear ?? null,
      startMonth: defaultValues?.startMonth ?? null,
      endYear: defaultValues?.endYear ?? null,
      endMonth: defaultValues?.endMonth ?? null,
      note: defaultValues?.note ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (mode === 'edit' && defaultValues?.relationId) {
      const result = await updateRelation({
        kind: 'marriage',
        relationId: defaultValues.relationId,
        type: values.marriageType,
        status: values.marriageStatus,
        startYear: values.startYear ?? null,
        startMonth: values.startMonth ?? null,
        endYear: values.endYear ?? null,
        endMonth: values.endMonth ?? null,
        note: values.note ?? null,
      });
      if (!result.ok) {
        if (result.error.field) {
          setError(result.error.field as keyof MarriageFormValues, {
            message: result.error.message,
          });
        } else {
          setError('root', { message: result.error.message });
          toast.error(result.error.message ?? '更新に失敗しました');
        }
        return;
      }
      toast.success('更新しました');
      onSuccess?.({ kind: 'marriage' });
    } else {
      const result = await createMarriage({
        partnerAId: fromPersonId,
        partnerBId: values.toPersonId,
        type: values.marriageType,
        status: values.marriageStatus,
        startYear: values.startYear ?? null,
        startMonth: values.startMonth ?? null,
        endYear: values.endYear ?? null,
        endMonth: values.endMonth ?? null,
        note: values.note ?? undefined,
      });
      if (!result.ok) {
        if (result.error.field) {
          setError(result.error.field as keyof MarriageFormValues, {
            message: result.error.message,
          });
        } else {
          setError('root', { message: result.error.message });
          toast.error(result.error.message ?? '追加に失敗しました');
        }
        return;
      }
      toast.success('追加しました');
      onSuccess?.({ relationId: result.data.relationId, kind: 'marriage' });
    }
  });

  const showToPersonSelect = !toPersonId;

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
      {/* 相手の人物選択 */}
      {showToPersonSelect && (
        <Controller
          name="toPersonId"
          control={control}
          render={({ field }) => (
            <PersonSearchCombobox
              persons={persons}
              excludeId={fromPersonId}
              value={field.value}
              onChange={field.onChange}
              label="パートナー（相手の人物）"
              error={errors.toPersonId?.message}
              required
            />
          )}
        />
      )}

      {/* 婚姻種別 */}
      <FormField>
        <FormLabel htmlFor="marriageType" required>
          婚姻種別
        </FormLabel>
        <Controller
          name="marriageType"
          control={control}
          render={({ field }) => (
            <select
              id="marriageType"
              className={styles.select}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value as MarriageType)}
            >
              {(Object.entries(MARRIAGE_TYPE_LABELS) as [MarriageType, string][]).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          )}
        />
        <FormError message={errors.marriageType?.message} />
      </FormField>

      {/* 婚姻状態 */}
      <FormField>
        <FormLabel htmlFor="marriageStatus" required>
          婚姻状態
        </FormLabel>
        <Controller
          name="marriageStatus"
          control={control}
          render={({ field }) => (
            <select
              id="marriageStatus"
              className={styles.select}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value as MarriageStatus)}
            >
              {(Object.entries(MARRIAGE_STATUS_LABELS) as [MarriageStatus, string][]).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          )}
        />
        <FormError message={errors.marriageStatus?.message} />
      </FormField>

      {/* 開始年月 */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>開始年月（任意）</legend>
        <div className={styles.yearMonthRow}>
          <Controller
            name="startYear"
            control={control}
            render={({ field }) => (
              <FormField className={styles.yearField}>
                <FormLabel htmlFor="startYear">年</FormLabel>
                <Input
                  id="startYear"
                  type="number"
                  placeholder="例: 2000"
                  min={1000}
                  max={9999}
                  value={numberToInputValue(field.value)}
                  onChange={(e) => field.onChange(inputValueToNumber(e.target.value))}
                  error={errors.startYear?.message}
                />
              </FormField>
            )}
          />
          <Controller
            name="startMonth"
            control={control}
            render={({ field }) => (
              <FormField className={styles.monthField}>
                <FormLabel htmlFor="startMonth">月</FormLabel>
                <Input
                  id="startMonth"
                  type="number"
                  placeholder="1〜12"
                  min={1}
                  max={12}
                  value={numberToInputValue(field.value)}
                  onChange={(e) => field.onChange(inputValueToNumber(e.target.value))}
                  error={errors.startMonth?.message}
                />
              </FormField>
            )}
          />
        </div>
      </fieldset>

      {/* 終了年月 */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>終了年月（任意・離婚・死別の場合）</legend>
        <div className={styles.yearMonthRow}>
          <Controller
            name="endYear"
            control={control}
            render={({ field }) => (
              <FormField className={styles.yearField}>
                <FormLabel htmlFor="endYear">年</FormLabel>
                <Input
                  id="endYear"
                  type="number"
                  placeholder="例: 2020"
                  min={1000}
                  max={9999}
                  value={numberToInputValue(field.value)}
                  onChange={(e) => field.onChange(inputValueToNumber(e.target.value))}
                  error={errors.endYear?.message}
                />
              </FormField>
            )}
          />
          <Controller
            name="endMonth"
            control={control}
            render={({ field }) => (
              <FormField className={styles.monthField}>
                <FormLabel htmlFor="endMonth">月</FormLabel>
                <Input
                  id="endMonth"
                  type="number"
                  placeholder="1〜12"
                  min={1}
                  max={12}
                  value={numberToInputValue(field.value)}
                  onChange={(e) => field.onChange(inputValueToNumber(e.target.value))}
                  error={errors.endMonth?.message}
                />
              </FormField>
            )}
          />
        </div>
      </fieldset>

      {/* メモ */}
      <FormField>
        <FormLabel htmlFor="marriageNote">メモ</FormLabel>
        <textarea
          id="marriageNote"
          className={styles.textarea}
          {...register('note')}
          placeholder="自由記述（1000文字以内）"
          rows={3}
          aria-describedby={errors.note ? 'marriageNote-error' : undefined}
        />
        <FormError id="marriageNote-error" message={errors.note?.message} />
      </FormField>

      {/* ルートエラー */}
      {errors.root && <FormError message={errors.root.message} />}

      {/* ボタン */}
      <div className={styles.actions}>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            キャンセル
          </Button>
        )}
        <Button type="submit" variant="primary" loading={isSubmitting} disabled={isSubmitting}>
          {mode === 'edit' ? '更新する' : '追加する'}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* RelationForm — メインエクスポート（kind で分岐）                    */
/* ------------------------------------------------------------------ */

export function RelationForm(props: RelationFormProps) {
  if (props.kind === 'parent_child') {
    return <ParentChildForm {...props} />;
  }
  return <MarriageForm {...props} />;
}
