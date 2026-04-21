'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal/Modal';
import { Button } from '@/components/ui/Button/Button';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  isLoading?: boolean;
  isConfirmDisabled?: boolean;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = '確認',
  cancelLabel = 'キャンセル',
  confirmVariant = 'primary',
  isLoading = false,
  isConfirmDisabled = false,
  children,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm" closeOnOverlayClick={!isLoading}>
      <div className={styles.body}>
        {description && (
          <p className={styles.description}>{description}</p>
        )}
        {children && (
          <div className={styles.childrenArea}>{children}</div>
        )}
      </div>
      <div className={styles.footer}>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={isLoading}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={confirmVariant}
          onClick={handleConfirm}
          loading={isLoading}
          disabled={isConfirmDisabled}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
