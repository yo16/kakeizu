'use client';

import { UpgradeButton } from './UpgradeButton';
import styles from './PlanComparisonTable.module.css';

export interface PlanRow {
  id: string;
  name: string;
  monthly_price_jpy: number;
  max_trees: number;
  max_persons_per_tree: number;
  max_photos_per_person: number;
  stripe_price_id: string | null;
  is_active: boolean;
}

interface PlanComparisonTableProps {
  plans: PlanRow[];
  currentPlanId: string;
}

function formatLimit(value: number): string {
  if (value === -1) return '無制限';
  return `${value.toLocaleString('ja-JP')}`;
}

function formatPrice(price: number): string {
  if (price === 0) return '無料';
  return `¥${price.toLocaleString('ja-JP')} / 月`;
}

export function PlanComparisonTable({ plans, currentPlanId }: PlanComparisonTableProps) {
  return (
    <section className={styles.section} id="plan-comparison" aria-labelledby="plan-comparison-heading">
      <h2 id="plan-comparison-heading" className={styles.heading}>
        プランを選択
      </h2>

      {/* PC: テーブル表示 */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.thFeature}>機能</th>
              {plans.map((plan) => (
                <th scope="col" key={plan.id} className={styles.thPlan}>
                  {plan.name}
                  {plan.id === currentPlanId && (
                    <span className={styles.currentBadge} aria-label="現在のプラン">
                      現在
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={styles.tdFeature}>月額</td>
              {plans.map((plan) => (
                <td key={plan.id} className={styles.tdValue}>
                  {formatPrice(plan.monthly_price_jpy)}
                </td>
              ))}
            </tr>
            <tr>
              <td className={styles.tdFeature}>家系図数</td>
              {plans.map((plan) => (
                <td key={plan.id} className={styles.tdValue}>
                  {formatLimit(plan.max_trees)}
                </td>
              ))}
            </tr>
            <tr>
              <td className={styles.tdFeature}>1ツリーの人物数</td>
              {plans.map((plan) => (
                <td key={plan.id} className={styles.tdValue}>
                  {formatLimit(plan.max_persons_per_tree)}
                </td>
              ))}
            </tr>
            <tr>
              <td className={styles.tdFeature}>1人物の写真数</td>
              {plans.map((plan) => (
                <td key={plan.id} className={styles.tdValue}>
                  {formatLimit(plan.max_photos_per_person)}
                </td>
              ))}
            </tr>
            <tr>
              <td className={styles.tdFeature}></td>
              {plans.map((plan) => (
                <td key={plan.id} className={styles.tdAction}>
                  <PlanAction plan={plan} currentPlanId={currentPlanId} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* タブレット縦・モバイル: カード表示 */}
      <div className={styles.cardGrid}>
        {plans.map((plan) => (
          <div key={plan.id} className={`${styles.planCard} ${plan.id === currentPlanId ? styles.planCardCurrent : ''}`}>
            <div className={styles.planCardHeader}>
              <span className={styles.planCardName}>{plan.name}</span>
              {plan.id === currentPlanId && (
                <span className={styles.currentBadge} aria-label="現在のプラン">
                  現在
                </span>
              )}
            </div>
            <p className={styles.planCardPrice}>{formatPrice(plan.monthly_price_jpy)}</p>
            <dl className={styles.planCardDetails}>
              <div className={styles.planCardDetailRow}>
                <dt>家系図数</dt>
                <dd>{formatLimit(plan.max_trees)}</dd>
              </div>
              <div className={styles.planCardDetailRow}>
                <dt>1ツリーの人物数</dt>
                <dd>{formatLimit(plan.max_persons_per_tree)}</dd>
              </div>
              <div className={styles.planCardDetailRow}>
                <dt>1人物の写真数</dt>
                <dd>{formatLimit(plan.max_photos_per_person)}</dd>
              </div>
            </dl>
            <div className={styles.planCardAction}>
              <PlanAction plan={plan} currentPlanId={currentPlanId} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface PlanActionProps {
  plan: PlanRow;
  currentPlanId: string;
}

function PlanAction({ plan, currentPlanId }: PlanActionProps) {
  const isCurrent = plan.id === currentPlanId;

  // 現在のプランは disabled
  if (isCurrent) {
    return (
      <span className={styles.currentLabel}>現在のプラン</span>
    );
  }

  // Free プランへのダウングレードはサポート案内
  if (plan.id === 'free') {
    return (
      <span className={styles.downgradeNote}>
        ダウングレードはサポートにご相談ください
      </span>
    );
  }

  // Enterprise (stripe_price_id=null かつ Free 以外) は問い合わせリンク
  if (!plan.stripe_price_id) {
    return (
      <a
        href="mailto:support@example.com?subject=Enterpriseプランのお問い合わせ"
        className={styles.contactLink}
      >
        お問い合わせ
      </a>
    );
  }

  return (
    <UpgradeButton
      priceId={plan.stripe_price_id}
      planName={plan.name}
    />
  );
}
