'use client';

/**
 * RelationDialog — 既存人物関係付けダイアログ (FR-V7)
 *
 * ツールバーの「関係を追加」ボタンから起動する。
 * ステップ:
 *   1. 関係種別選択 (親子 / 婚姻)
 *   2. 1人目を選択 (インクリメンタル検索)
 *   3. 2人目を選択 (インクリメンタル検索)
 *   4. 詳細項目 (parent_role / marriage_type / dates) 入力
 *   5. 確認 → submit
 */
import React, { useCallback, useEffect, useState, useTransition } from 'react';
import { Modal } from '@/components/ui/Modal/Modal';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { FormField, FormLabel, FormError } from '@/components/ui/Form/Form';
import { useToast } from '@/components/ui/Toast/ToastProvider';
import { getPersonsByTree, type PersonSummary } from '@/features/person/actions';
import { createParentChild, createMarriage } from '@/features/relation/actions';
import type { ParentRole, MarriageType, MarriageStatus } from '@/features/relation/schemas';
import styles from './RelationDialog.module.css';

/* ------------------------------------------------------------------ */
/* 型定義                                                               */
/* ------------------------------------------------------------------ */

type RelationKind = 'parent_child' | 'marriage';

type Step = 'kind' | 'person1' | 'person2' | 'detail' | 'confirm';

interface RelationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  treeId: string;
  /** 関係作成成功時に呼ばれるコールバック */
  onSuccess?: (relationId: string) => void;
}

/* ------------------------------------------------------------------ */
/* ラベル定数                                                           */
/* ------------------------------------------------------------------ */

const PARENT_ROLE_LABELS: Record<ParentRole, string> = {
  biological: '実親',
  adoptive: '養親',
  step: '義親',
};

const MARRIAGE_TYPE_LABELS: Record<MarriageType, string> = {
  spouse: '配偶者',
  common_law: '事実婚',
  same_sex_partner: '同性パートナー',
};

const MARRIAGE_STATUS_LABELS: Record<MarriageStatus, string> = {
  current: '婚姻中',
  divorced: '離婚',
  widowed: '死別',
};

/* ------------------------------------------------------------------ */
/* PersonSearchList — 人物検索・選択サブコンポーネント                 */
/* ------------------------------------------------------------------ */

interface PersonSearchListProps {
  persons: PersonSummary[];
  excludeId?: string;
  selectedId: string | null;
  onSelect: (person: PersonSummary) => void;
  label: string;
}

function PersonSearchList({
  persons,
  excludeId,
  selectedId,
  onSelect,
  label,
}: PersonSearchListProps) {
  const [query, setQuery] = useState('');

  const filtered = persons.filter(
    (p) =>
      p.id !== excludeId &&
      p.displayName.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className={styles.personSearch}>
      <Input
        type="search"
        label={label}
        placeholder="名前で検索..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={`${label}の検索`}
      />
      <ul className={styles.personList} role="listbox" aria-label={label}>
        {filtered.length === 0 ? (
          <li className={styles.personListEmpty}>該当する人物が見つかりません</li>
        ) : (
          filtered.map((p) => (
            <li
              key={p.id}
              role="option"
              aria-selected={p.id === selectedId}
              className={[
                styles.personListItem,
                p.id === selectedId ? styles.personListItemSelected : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(p);
                }
              }}
              tabIndex={0}
            >
              <span className={styles.personName}>{p.displayName}</span>
              {p.birthYear && (
                <span className={styles.personMeta}>{p.birthYear}年生</span>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* YearMonthInput — 年月入力サブコンポーネント                         */
/* ------------------------------------------------------------------ */

interface YearMonthInputProps {
  label: string;
  year: string;
  month: string;
  onYearChange: (v: string) => void;
  onMonthChange: (v: string) => void;
  error?: string;
}

function YearMonthInput({
  label,
  year,
  month,
  onYearChange,
  onMonthChange,
  error,
}: YearMonthInputProps) {
  return (
    <FormField>
      <FormLabel>{label}</FormLabel>
      <div className={styles.yearMonthRow}>
        <Input
          type="number"
          placeholder="年 (例: 2000)"
          value={year}
          onChange={(e) => onYearChange(e.target.value)}
          min={1000}
          max={9999}
          aria-label={`${label}（年）`}
        />
        <span className={styles.yearMonthSep}>年</span>
        <Input
          type="number"
          placeholder="月"
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          min={1}
          max={12}
          aria-label={`${label}（月）`}
        />
        <span className={styles.yearMonthSep}>月</span>
      </div>
      {error && <FormError message={error} />}
    </FormField>
  );
}

/* ------------------------------------------------------------------ */
/* RelationDialog — メインコンポーネント                               */
/* ------------------------------------------------------------------ */

export function RelationDialog({ isOpen, onClose, treeId, onSuccess }: RelationDialogProps) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  // 人物一覧
  const [persons, setPersons] = useState<PersonSummary[]>([]);
  const [personsLoading, setPersonsLoading] = useState(false);

  // ステップ管理
  const [step, setStep] = useState<Step>('kind');

  // フォーム値
  const [kind, setKind] = useState<RelationKind | null>(null);
  const [person1, setPerson1] = useState<PersonSummary | null>(null);
  const [person2, setPerson2] = useState<PersonSummary | null>(null);

  // 親子関係の詳細
  const [parentRole, setParentRole] = useState<ParentRole>('biological');

  // 婚姻関係の詳細
  const [marriageType, setMarriageType] = useState<MarriageType>('spouse');
  const [marriageStatus, setMarriageStatus] = useState<MarriageStatus>('current');
  const [startYear, setStartYear] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [endYear, setEndYear] = useState('');
  const [endMonth, setEndMonth] = useState('');

  // バリデーションエラー
  const [detailError, setDetailError] = useState<string | null>(null);

  /* ダイアログを開くたびに初期化 */
  useEffect(() => {
    if (isOpen) {
      setStep('kind');
      setKind(null);
      setPerson1(null);
      setPerson2(null);
      setParentRole('biological');
      setMarriageType('spouse');
      setMarriageStatus('current');
      setStartYear('');
      setStartMonth('');
      setEndYear('');
      setEndMonth('');
      setDetailError(null);
    }
  }, [isOpen]);

  /* ダイアログを開いた際に人物一覧を取得 */
  useEffect(() => {
    if (!isOpen) return;
    setPersonsLoading(true);
    getPersonsByTree(treeId)
      .then((result) => {
        if (result.ok) {
          setPersons(result.data);
        } else {
          toast.error('人物一覧の取得に失敗しました');
        }
      })
      .finally(() => setPersonsLoading(false));
  }, [isOpen, treeId, toast]);

  /* ---- ステップナビゲーション ---- */

  const handleKindSelect = (selected: RelationKind) => {
    setKind(selected);
    setStep('person1');
  };

  const handlePerson1Select = (p: PersonSummary) => {
    setPerson1(p);
    setStep('person2');
  };

  const handlePerson2Select = (p: PersonSummary) => {
    setPerson2(p);
    setStep('detail');
  };

  const handleDetailNext = () => {
    // 年月のバリデーション (婚姻の場合)
    if (kind === 'marriage') {
      if (startYear && (isNaN(Number(startYear)) || Number(startYear) < 1000 || Number(startYear) > 9999)) {
        setDetailError('開始年は1000〜9999の範囲で入力してください');
        return;
      }
      if (endYear && (isNaN(Number(endYear)) || Number(endYear) < 1000 || Number(endYear) > 9999)) {
        setDetailError('終了年は1000〜9999の範囲で入力してください');
        return;
      }
      if (startYear && endYear && Number(endYear) < Number(startYear)) {
        setDetailError('終了年は開始年以降である必要があります');
        return;
      }
    }
    setDetailError(null);
    setStep('confirm');
  };

  const handleBack = () => {
    if (step === 'person1') setStep('kind');
    else if (step === 'person2') setStep('person1');
    else if (step === 'detail') setStep('person2');
    else if (step === 'confirm') setStep('detail');
  };

  /* ---- 送信 ---- */

  const handleSubmit = useCallback(() => {
    if (!kind || !person1 || !person2) return;

    startTransition(async () => {
      let result;
      if (kind === 'parent_child') {
        result = await createParentChild({
          parentId: person1.id,
          childId: person2.id,
          parentRole,
        });
      } else {
        result = await createMarriage({
          partnerAId: person1.id,
          partnerBId: person2.id,
          type: marriageType,
          status: marriageStatus,
          startYear: startYear ? Number(startYear) : null,
          startMonth: startMonth ? Number(startMonth) : null,
          endYear: endYear ? Number(endYear) : null,
          endMonth: endMonth ? Number(endMonth) : null,
        });
      }

      if (!result.ok) {
        toast.error(result.error.message ?? '関係の作成に失敗しました');
        return;
      }

      toast.success('関係を作成しました');
      onSuccess?.(result.data.relationId);
      onClose();
    });
  }, [
    kind, person1, person2,
    parentRole, marriageType, marriageStatus,
    startYear, startMonth, endYear, endMonth,
    toast, onSuccess, onClose,
  ]);

  /* ---- ステップタイトル ---- */
  const stepTitle =
    step === 'kind' ? '関係種別を選択'
    : step === 'person1' ? kind === 'parent_child' ? '親を選択' : '1人目を選択'
    : step === 'person2' ? kind === 'parent_child' ? '子を選択' : '2人目を選択'
    : step === 'detail' ? '詳細を入力'
    : '確認';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`関係を追加 — ${stepTitle}`}
      size="md"
      closeOnOverlayClick={!isPending}
    >
      <div className={styles.content}>
        {/* ---- ステップ: 関係種別選択 ---- */}
        {step === 'kind' && (
          <div className={styles.kindStep}>
            <p className={styles.stepDescription}>作成する関係の種別を選択してください。</p>
            <div className={styles.kindButtons}>
              <button
                type="button"
                className={[styles.kindButton, kind === 'parent_child' ? styles.kindButtonSelected : ''].filter(Boolean).join(' ')}
                onClick={() => handleKindSelect('parent_child')}
              >
                <span className={styles.kindButtonIcon} aria-hidden="true">👥</span>
                <span className={styles.kindButtonLabel}>親子関係</span>
                <span className={styles.kindButtonDesc}>親と子の関係を登録します</span>
              </button>
              <button
                type="button"
                className={[styles.kindButton, kind === 'marriage' ? styles.kindButtonSelected : ''].filter(Boolean).join(' ')}
                onClick={() => handleKindSelect('marriage')}
              >
                <span className={styles.kindButtonIcon} aria-hidden="true">💍</span>
                <span className={styles.kindButtonLabel}>婚姻関係</span>
                <span className={styles.kindButtonDesc}>配偶者・パートナー関係を登録します</span>
              </button>
            </div>
          </div>
        )}

        {/* ---- ステップ: 人物1選択 ---- */}
        {step === 'person1' && (
          <div className={styles.personStep}>
            <p className={styles.stepDescription}>
              {kind === 'parent_child' ? '親となる人物を選択してください。' : '1人目の人物を選択してください。'}
            </p>
            {personsLoading ? (
              <p className={styles.loading}>読み込み中...</p>
            ) : (
              <PersonSearchList
                persons={persons}
                selectedId={person1?.id ?? null}
                onSelect={handlePerson1Select}
                label={kind === 'parent_child' ? '親' : '1人目'}
              />
            )}
          </div>
        )}

        {/* ---- ステップ: 人物2選択 ---- */}
        {step === 'person2' && (
          <div className={styles.personStep}>
            <p className={styles.stepDescription}>
              {kind === 'parent_child' ? '子となる人物を選択してください。' : '2人目の人物を選択してください。'}
            </p>
            {person1 && (
              <div className={styles.selectedPersonBadge}>
                {kind === 'parent_child' ? '親: ' : '1人目: '}<strong>{person1.displayName}</strong>
              </div>
            )}
            {personsLoading ? (
              <p className={styles.loading}>読み込み中...</p>
            ) : (
              <PersonSearchList
                persons={persons}
                excludeId={person1?.id}
                selectedId={person2?.id ?? null}
                onSelect={handlePerson2Select}
                label={kind === 'parent_child' ? '子' : '2人目'}
              />
            )}
          </div>
        )}

        {/* ---- ステップ: 詳細入力 ---- */}
        {step === 'detail' && (
          <div className={styles.detailStep}>
            <div className={styles.selectedPersonsBadges}>
              {kind === 'parent_child' ? (
                <>
                  <span className={styles.selectedPersonBadge}>親: <strong>{person1?.displayName}</strong></span>
                  <span className={styles.selectedPersonBadge}>子: <strong>{person2?.displayName}</strong></span>
                </>
              ) : (
                <>
                  <span className={styles.selectedPersonBadge}>1人目: <strong>{person1?.displayName}</strong></span>
                  <span className={styles.selectedPersonBadge}>2人目: <strong>{person2?.displayName}</strong></span>
                </>
              )}
            </div>

            {/* 親子関係の詳細 */}
            {kind === 'parent_child' && (
              <FormField>
                <FormLabel required>親の役割</FormLabel>
                <div className={styles.radioGroup} role="radiogroup" aria-label="親の役割">
                  {(Object.entries(PARENT_ROLE_LABELS) as [ParentRole, string][]).map(([value, label]) => (
                    <label key={value} className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="parentRole"
                        value={value}
                        checked={parentRole === value}
                        onChange={() => setParentRole(value)}
                        className={styles.radioInput}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </FormField>
            )}

            {/* 婚姻関係の詳細 */}
            {kind === 'marriage' && (
              <>
                <FormField>
                  <FormLabel required>婚姻種別</FormLabel>
                  <div className={styles.radioGroup} role="radiogroup" aria-label="婚姻種別">
                    {(Object.entries(MARRIAGE_TYPE_LABELS) as [MarriageType, string][]).map(([value, label]) => (
                      <label key={value} className={styles.radioLabel}>
                        <input
                          type="radio"
                          name="marriageType"
                          value={value}
                          checked={marriageType === value}
                          onChange={() => setMarriageType(value)}
                          className={styles.radioInput}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </FormField>

                <FormField>
                  <FormLabel required>婚姻状態</FormLabel>
                  <div className={styles.radioGroup} role="radiogroup" aria-label="婚姻状態">
                    {(Object.entries(MARRIAGE_STATUS_LABELS) as [MarriageStatus, string][]).map(([value, label]) => (
                      <label key={value} className={styles.radioLabel}>
                        <input
                          type="radio"
                          name="marriageStatus"
                          value={value}
                          checked={marriageStatus === value}
                          onChange={() => setMarriageStatus(value)}
                          className={styles.radioInput}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </FormField>

                <YearMonthInput
                  label="開始年月 (任意)"
                  year={startYear}
                  month={startMonth}
                  onYearChange={setStartYear}
                  onMonthChange={setStartMonth}
                />

                <YearMonthInput
                  label="終了年月 (任意・離婚・死別の場合)"
                  year={endYear}
                  month={endMonth}
                  onYearChange={setEndYear}
                  onMonthChange={setEndMonth}
                />
              </>
            )}

            {detailError && <FormError message={detailError} />}
          </div>
        )}

        {/* ---- ステップ: 確認 ---- */}
        {step === 'confirm' && (
          <div className={styles.confirmStep}>
            <p className={styles.stepDescription}>以下の内容で関係を作成します。</p>
            <dl className={styles.confirmList}>
              <div className={styles.confirmRow}>
                <dt className={styles.confirmLabel}>関係種別</dt>
                <dd className={styles.confirmValue}>
                  {kind === 'parent_child' ? '親子関係' : '婚姻関係'}
                </dd>
              </div>
              {kind === 'parent_child' ? (
                <>
                  <div className={styles.confirmRow}>
                    <dt className={styles.confirmLabel}>親</dt>
                    <dd className={styles.confirmValue}>{person1?.displayName}</dd>
                  </div>
                  <div className={styles.confirmRow}>
                    <dt className={styles.confirmLabel}>子</dt>
                    <dd className={styles.confirmValue}>{person2?.displayName}</dd>
                  </div>
                  <div className={styles.confirmRow}>
                    <dt className={styles.confirmLabel}>親の役割</dt>
                    <dd className={styles.confirmValue}>{PARENT_ROLE_LABELS[parentRole]}</dd>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.confirmRow}>
                    <dt className={styles.confirmLabel}>1人目</dt>
                    <dd className={styles.confirmValue}>{person1?.displayName}</dd>
                  </div>
                  <div className={styles.confirmRow}>
                    <dt className={styles.confirmLabel}>2人目</dt>
                    <dd className={styles.confirmValue}>{person2?.displayName}</dd>
                  </div>
                  <div className={styles.confirmRow}>
                    <dt className={styles.confirmLabel}>婚姻種別</dt>
                    <dd className={styles.confirmValue}>{MARRIAGE_TYPE_LABELS[marriageType]}</dd>
                  </div>
                  <div className={styles.confirmRow}>
                    <dt className={styles.confirmLabel}>婚姻状態</dt>
                    <dd className={styles.confirmValue}>{MARRIAGE_STATUS_LABELS[marriageStatus]}</dd>
                  </div>
                  {startYear && (
                    <div className={styles.confirmRow}>
                      <dt className={styles.confirmLabel}>開始</dt>
                      <dd className={styles.confirmValue}>
                        {startYear}年{startMonth ? `${startMonth}月` : ''}
                      </dd>
                    </div>
                  )}
                  {endYear && (
                    <div className={styles.confirmRow}>
                      <dt className={styles.confirmLabel}>終了</dt>
                      <dd className={styles.confirmValue}>
                        {endYear}年{endMonth ? `${endMonth}月` : ''}
                      </dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </div>
        )}
      </div>

      {/* ---- フッターボタン ---- */}
      <div className={styles.footer}>
        {step !== 'kind' && (
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            disabled={isPending}
          >
            戻る
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={isPending}
        >
          キャンセル
        </Button>
        {step === 'detail' && (
          <Button
            type="button"
            variant="primary"
            onClick={handleDetailNext}
          >
            次へ
          </Button>
        )}
        {step === 'confirm' && (
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            loading={isPending}
          >
            作成する
          </Button>
        )}
      </div>
    </Modal>
  );
}
