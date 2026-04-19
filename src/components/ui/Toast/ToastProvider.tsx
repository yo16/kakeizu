'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Toast, ToastItem, ToastVariant } from './Toast';
import styles from './Toast.module.css';

export interface ToastOptions {
  variant: ToastVariant;
  message: string;
  duration?: number;
}

export interface ToastContextValue {
  show(options: ToastOptions): string;
  success(message: string, duration?: number): string;
  error(message: string, duration?: number): string;
  warning(message: string, duration?: number): string;
  info(message: string, duration?: number): string;
  dismiss(id: string): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast は ToastProvider の内側で使用してください');
  }
  return ctx;
}

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // タイマー管理: タイムアウトIDをidごとに保持
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (options: ToastOptions): string => {
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);

      const duration = options.duration ?? 4000;

      const item: ToastItem = {
        id,
        variant: options.variant,
        message: options.message,
        duration,
      };

      setToasts((prev) => [...prev, item]);

      if (duration > 0) {
        const timer = setTimeout(() => {
          dismiss(id);
        }, duration);
        timers.current.set(id, timer);
      }

      return id;
    },
    [dismiss]
  );

  const success = useCallback(
    (message: string, duration?: number): string =>
      show({ variant: 'success', message, duration }),
    [show]
  );

  const error = useCallback(
    (message: string, duration?: number): string =>
      show({ variant: 'error', message, duration }),
    [show]
  );

  const warning = useCallback(
    (message: string, duration?: number): string =>
      show({ variant: 'warning', message, duration }),
    [show]
  );

  const info = useCallback(
    (message: string, duration?: number): string =>
      show({ variant: 'info', message, duration }),
    [show]
  );

  const value: ToastContextValue = { show, success, error, warning, info, dismiss };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.container} aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
