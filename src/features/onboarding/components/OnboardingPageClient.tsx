'use client';

/**
 * OnboardingPageClient
 *
 * オンボーディングページのクライアント部分。
 * localStorage の完了フラグを確認し、完了済みであれば /trees/[treeId] へリダイレクトする。
 * 未完了であれば OnboardingWizard を表示する。
 *
 * 実装方針:
 *   - localStorage はクライアント専用の外部システムであるため、
 *     useSyncExternalStore パターンで初期値を読み取る。
 *   - 完了済みの場合は useEffect でリダイレクトのみ行う（setState は呼ばない）。
 */

import React, { useSyncExternalStore, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { OnboardingWizard } from './OnboardingWizard';
import { getCompletionKey } from '../lib/completion-key';
import styles from './OnboardingPageClient.module.css';

interface OnboardingPageClientProps {
  treeId: string;
}

/** localStorage から完了フラグを読み取るスナップショット関数 */
function getLocalSnapshot(treeId: string): boolean {
  try {
    return localStorage.getItem(getCompletionKey(treeId)) === 'true';
  } catch {
    return false;
  }
}

/** SSR 用サーバースナップショット（常に false = 未完了として扱う） */
function getServerSnapshot(): boolean {
  return false;
}

export function OnboardingPageClient({ treeId }: OnboardingPageClientProps) {
  const router = useRouter();

  const isCompleted = useSyncExternalStore(
    // subscribe: localStorage の変化を購読。
    // localStorage は他タブからの変化のみ storageEvent で検知できるが、
    // このページでは onComplete 後に router.push で即離脱するため、
    // 同タブからの変化通知は不要。空のクリーンアップ関数を返すのみで問題ない。
    (/* callback */) => () => {},
    // クライアント側スナップショット
    () => getLocalSnapshot(treeId),
    // サーバー側スナップショット
    getServerSnapshot
  );

  useEffect(() => {
    if (isCompleted) {
      router.replace(`/trees/${treeId}`);
    }
  }, [isCompleted, treeId, router]);

  if (isCompleted) {
    return (
      <div className={styles.loading} aria-busy="true" aria-label="読み込み中">
        <span className={styles.spinner} aria-hidden="true" />
      </div>
    );
  }

  return <OnboardingWizard treeId={treeId} />;
}
