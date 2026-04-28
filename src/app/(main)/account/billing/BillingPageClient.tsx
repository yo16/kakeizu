'use client';

import { CurrentPlanCard } from '@/features/billing/components/CurrentPlanCard';
import { PlanComparisonTable } from '@/features/billing/components/PlanComparisonTable';
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
}

export function BillingPageClient({ currentPlan, plans }: BillingPageClientProps) {
  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>プランと請求</h1>

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
