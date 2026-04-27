'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button/Button';
import { useToast } from '@/components/ui/Toast/ToastProvider';
import { createPortalSession } from '@/features/billing/actions/create-portal-session';
import { redirectExternal } from '@/lib/navigation/redirect';

import styles from './BillingPortalLink.module.css';

export function BillingPortalLink() {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleClick = async () => {
    setLoading(true);
    try {
      const result = await createPortalSession();
      if (result.ok) {
        redirectExternal(result.data.url);
      } else {
        toast.error(result.error.message);
      }
    } catch (err) {
      console.error('[BillingPortalLink] エラー:', err);
      toast.error('Customer Portal への接続に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <Button
        variant="secondary"
        size="md"
        loading={loading}
        onClick={handleClick}
      >
        支払い・解約を管理
      </Button>
    </div>
  );
}
