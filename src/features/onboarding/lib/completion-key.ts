/**
 * オンボーディング完了フラグの localStorage キーを返すユーティリティ。
 *
 * OnboardingWizard と OnboardingPageClient の両方で使用するため、
 * 共通モジュールとして切り出す。
 */

/** localStorage に完了フラグを保存するキー */
export function getCompletionKey(treeId: string): string {
  return `onboarding_completed_${treeId}`;
}
