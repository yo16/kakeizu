'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { useToast } from '@/components/ui/Toast/ToastProvider';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { deleteAccount } from '@/features/auth/actions';
import styles from './DeleteAccountButton.module.css';

interface DeleteAccountButtonProps {
  userEmail: string;
}

export function DeleteAccountButton({ userEmail }: DeleteAccountButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const isConfirmEnabled = confirmEmail === userEmail;

  const handleOpenDialog = () => {
    setConfirmEmail('');
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    if (isLoading) return;
    setIsDialogOpen(false);
    setConfirmEmail('');
  };

  const handleConfirm = async () => {
    if (!isConfirmEnabled) return;

    setIsLoading(true);
    try {
      const result = await deleteAccount({ confirmEmail });
      if (!result.ok) {
        toast.error(result.error.message ?? 'アカウントの削除に失敗しました。');
        setIsLoading(false);
        return;
      }
      // 成功時は deleteAccount Server Action 側でリダイレクト済み
    } catch {
      toast.error('アカウントの削除に失敗しました。もう一度お試しください。');
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button type="button" variant="danger" onClick={handleOpenDialog}>
        アカウントを削除
      </Button>

      <ConfirmDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        onConfirm={handleConfirm}
        title="アカウントを削除しますか？"
        description="この操作は取り消せません。すべてのデータが完全に削除されます。"
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        confirmVariant="danger"
        isLoading={isLoading}
        isConfirmDisabled={!isConfirmEnabled}
      >
        <div className={styles.emailConfirm}>
          <p className={styles.emailConfirmLabel}>
            確認のため、メールアドレスを入力してください
          </p>
          <Input
            type="email"
            placeholder={userEmail}
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            disabled={isLoading}
            aria-label="メールアドレスの確認入力"
          />
        </div>
      </ConfirmDialog>
    </>
  );
}
