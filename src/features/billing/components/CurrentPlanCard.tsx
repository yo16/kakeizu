'use client';

import { BillingPortalLink } from './BillingPortalLink';
import styles from './CurrentPlanCard.module.css';

interface CurrentPlanCardProps {
  planName: string;
  planId: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function CurrentPlanCard({
  planName,
  planId,
  status,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  stripeCustomerId,
}: CurrentPlanCardProps) {
  return (
    <section className={styles.card} aria-labelledby="current-plan-heading">
      <h2 id="current-plan-heading" className={styles.heading}>
        現在のプラン
      </h2>

      <div className={styles.planName}>{planName}</div>

      {/* 支払い失敗 */}
      {status === 'past_due' && (
        <div className={styles.alertDanger} role="alert">
          <span className={styles.alertIcon} aria-hidden="true">⚠️</span>
          <span>
            支払いが失敗しました。
            <BillingPortalLink />
            から支払い方法を更新してください。
          </span>
        </div>
      )}

      {/* 解約予定 */}
      {cancelAtPeriodEnd && currentPeriodEnd && (
        <div className={styles.alertInfo} role="status">
          <span className={styles.alertIcon} aria-hidden="true">ℹ️</span>
          <span>
            {formatDate(currentPeriodEnd)} に解約予定です。それまでは引き続きご利用いただけます。
          </span>
        </div>
      )}

      {/* 次回課金日 (有料プランかつ解約予定でない場合) */}
      {planId !== 'free' && currentPeriodEnd && !cancelAtPeriodEnd && (
        <p className={styles.renewalDate}>
          <span className={styles.renewalLabel}>次回課金日:</span>
          {formatDate(currentPeriodEnd)}
        </p>
      )}

      {/* Customer Portal ボタン (Stripe 登録済みユーザーのみ) */}
      {stripeCustomerId && status !== 'past_due' && (
        <div className={styles.portalWrapper}>
          <BillingPortalLink />
        </div>
      )}
    </section>
  );
}
