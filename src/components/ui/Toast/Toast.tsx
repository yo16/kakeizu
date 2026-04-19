'use client';

import React from 'react';
import styles from './Toast.module.css';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  duration: number;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const VARIANT_ICON: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

const VARIANT_ICON_CLASS: Record<ToastVariant, string> = {
  success: styles.iconSuccess,
  error: styles.iconError,
  warning: styles.iconWarning,
  info: styles.iconInfo,
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const role = toast.variant === 'error' ? 'alert' : 'status';

  return (
    <div
      className={`${styles.toast} ${styles[toast.variant]}`}
      role={role}
    >
      <span className={`${styles.icon} ${VARIANT_ICON_CLASS[toast.variant]}`} aria-hidden="true">
        {VARIANT_ICON[toast.variant]}
      </span>
      <p className={styles.message}>{toast.message}</p>
      <button
        type="button"
        className={styles.dismissButton}
        onClick={() => onDismiss(toast.id)}
        aria-label="通知を閉じる"
      >
        ✕
      </button>
    </div>
  );
}
