import { MainShell } from '@/components/layout/MainShell';
import { getServerSession } from '@/lib/auth/session';
import { getPlanSummary } from '@/features/billing/lib/get-plan-summary';

import { BillingPageClient } from './BillingPageClient';

export default async function BillingPage() {
  const session = await getServerSession();

  // (main)/layout.tsx で認証済みが保証されているが、型安全のため null チェック
  if (!session) {
    // middleware でリダイレクトされているはずだが念のため
    return null;
  }

  const { subscription, currentPlan, plans, overages } = await getPlanSummary(
    session.user.id
  );

  const currentPlanInfo = {
    planName: currentPlan?.name ?? 'Free',
    planId: subscription.plan_id,
    status: subscription.status,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    stripeCustomerId: subscription.stripe_customer_id,
  };

  return (
    <MainShell>
      <BillingPageClient
        currentPlan={currentPlanInfo}
        plans={plans}
        overages={overages}
      />
    </MainShell>
  );
}
