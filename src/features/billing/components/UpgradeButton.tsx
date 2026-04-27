'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button/Button';
import { useToast } from '@/components/ui/Toast/ToastProvider';
import { createCheckoutSession } from '@/features/billing/actions/create-checkout-session';
import { redirectExternal } from '@/lib/navigation/redirect';

import styles from './UpgradeButton.module.css';

interface UpgradeButtonProps {
  priceId: string;
  planName: string;
  disabled?: boolean;
}

export function UpgradeButton({ priceId, planName, disabled = false }: UpgradeButtonProps) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleClick = async () => {
    if (disabled || loading) return;
    setLoading(true);
    try {
      const result = await createCheckoutSession({ priceId });
      if (result.ok) {
        redirectExternal(result.data.url);
      } else {
        toast.error(result.error.message);
      }
    } catch (err) {
      console.error('[UpgradeButton] エラー:', err);
      toast.error('Checkout セッションの開始に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <Button
        variant="primary"
        size="sm"
        loading={loading}
        disabled={disabled}
        onClick={handleClick}
        aria-label={`${planName} プランにアップグレード`}
      >
        このプランにする
      </Button>
    </div>
  );
}
