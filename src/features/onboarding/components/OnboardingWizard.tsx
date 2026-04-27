'use client';

/**
 * OnboardingWizard
 *
 * 新規ツリー作成後に表示するステップ型オンボーディングウィザード。
 *
 * ステップ:
 *   1. Self     - 起点となる人物を登録
 *   2. Spouse   - 配偶者を追加（任意・スキップ可）
 *   3. Children - 子を追加（0〜N名・スキップ可）
 *   完了 → localStorage にフラグを保存し /trees/[treeId] へ遷移
 *
 * 完了フラグ: localStorage に `onboarding_completed_${treeId}` を保存する。
 *
 * ヘッダーのスキップボタン:
 *   全ステップ（Self / Spouse / Children）で共通。押すとウィザード全体を終了する。
 *   （localStorage 完了フラグを保存してツリー画面へ遷移）
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

import { WizardStepSelf } from './WizardStepSelf';
import { WizardStepSpouse } from './WizardStepSpouse';
import { WizardStepChildren } from './WizardStepChildren';
import { getCompletionKey } from '../lib/completion-key';

import styles from './OnboardingWizard.module.css';

type WizardStep = 'self' | 'spouse' | 'children';

const STEP_ORDER: WizardStep[] = ['self', 'spouse', 'children'];

const STEP_LABELS: Record<WizardStep, string> = {
  self: 'あなたの情報',
  spouse: '配偶者',
  children: '子ども',
};

interface OnboardingWizardProps {
  treeId: string;
}

export function OnboardingWizard({ treeId }: OnboardingWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<WizardStep>('self');
  const [originPersonId, setOriginPersonId] = useState<string | null>(null);

  const currentStepIndex = STEP_ORDER.indexOf(currentStep);
  const totalSteps = STEP_ORDER.length;

  /** ウィザード全体を完了してツリー画面へ遷移する */
  const handleComplete = () => {
    localStorage.setItem(getCompletionKey(treeId), 'true');
    router.push(`/trees/${treeId}`);
  };

  const goToNextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      setCurrentStep(STEP_ORDER[nextIndex]);
    } else {
      handleComplete();
    }
  };

  const handleSelfComplete = (personId: string) => {
    setOriginPersonId(personId);
    goToNextStep();
  };

  return (
    <div className={styles.wizard}>
      {/* ヘッダー */}
      <div className={styles.header}>
        <h1 className={styles.title}>家系図へようこそ</h1>
        <p className={styles.subtitle}>
          いくつかの質問に答えて、家系図を始めましょう。
          すべてのステップはスキップできます。
        </p>
      </div>

      {/* 進捗インジケータ */}
      <div className={styles.progress} aria-label={`ステップ ${currentStepIndex + 1} / ${totalSteps}`}>
        <div className={styles.progressSteps}>
          {STEP_ORDER.map((step, index) => (
            <div key={step} className={styles.progressStepWrapper}>
              <div
                className={[
                  styles.progressStep,
                  index < currentStepIndex ? styles.progressStepDone : '',
                  index === currentStepIndex ? styles.progressStepActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={index === currentStepIndex ? 'step' : undefined}
              >
                {index < currentStepIndex ? (
                  <span aria-hidden="true">✓</span>
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span className={styles.progressStepLabel}>{STEP_LABELS[step]}</span>
            </div>
          ))}
        </div>
        <p className={styles.progressText}>
          ステップ {currentStepIndex + 1} / {totalSteps}
        </p>
      </div>

      {/* ステップコンテンツ */}
      <div className={styles.stepContainer}>
        {/* ステップタイトル + スキップボタン（全ステップ共通） */}
        <div className={styles.stepHeader}>
          <h2 className={styles.stepTitle}>{STEP_LABELS[currentStep]}</h2>
          <button
            type="button"
            className={styles.skipButton}
            onClick={handleComplete}
            aria-label="オンボーディングをスキップしてツリー画面へ"
          >
            スキップ
          </button>
        </div>

        {/* 各ステップ */}
        {currentStep === 'self' && (
          <WizardStepSelf
            treeId={treeId}
            onComplete={handleSelfComplete}
          />
        )}
        {currentStep === 'spouse' && originPersonId && (
          <WizardStepSpouse
            originPersonId={originPersonId}
            onComplete={goToNextStep}
            onSkip={goToNextStep}
          />
        )}
        {currentStep === 'children' && originPersonId && (
          <WizardStepChildren
            originPersonId={originPersonId}
            onComplete={handleComplete}
          />
        )}
      </div>
    </div>
  );
}
