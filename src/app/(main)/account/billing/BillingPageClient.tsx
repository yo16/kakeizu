'use client';

import { CurrentPlanCard } from '@/features/billing/components/CurrentPlanCard';
import { OverLimitBanner } from '@/features/billing/components/OverLimitBanner';
import { PlanComparisonTable } from '@/features/billing/components/PlanComparisonTable';
import type { OverageEntry } from '@/features/billing/components/OverLimitBanner';
import type { PlanRow } from '@/features/billing/components/PlanComparisonTable';

import styles from './page.module.css';

interface CurrentPlanInfo {
  planName: string;
  planId: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
}

interface BillingPageClientProps {
  currentPlan: CurrentPlanInfo;
  plans: PlanRow[];
  overages: OverageEntry[];
}

export function BillingPageClient({ currentPlan, plans, overages }: BillingPageClientProps) {
  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>プランと請求</h1>

      <OverLimitBanner overages={overages} />

      <CurrentPlanCard
        planName={currentPlan.planName}
        planId={currentPlan.planId}
        status={currentPlan.status}
        currentPeriodEnd={currentPlan.currentPeriodEnd}
        cancelAtPeriodEnd={currentPlan.cancelAtPeriodEnd}
        stripeCustomerId={currentPlan.stripeCustomerId}
      />

      <PlanComparisonTable
        plans={plans}
        currentPlanId={currentPlan.planId}
      />
    </div>
  );
}
