'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button/Button';
import { useToast } from '@/components/ui/Toast/ToastProvider';
import { signOut } from '@/features/auth/actions';

export function LogoutButton() {
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await signOut();
      // 成功時は signOut Server Action 側でリダイレクト済み
    } catch {
      toast.error('ログアウトに失敗しました。もう一度お試しください。');
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      loading={isLoading}
      onClick={handleLogout}
    >
      ログアウト
    </Button>
  );
}
