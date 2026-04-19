import type { Metadata } from 'next';
import Link from 'next/link';

import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm';

import styles from './reset-password.module.css';

export const metadata: Metadata = {
  title: '新しいパスワードを設定 | kakeizu',
  description: '新しいパスワードを設定します',
};

export default function ResetPasswordPage() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>新しいパスワードを設定</h1>

      <ResetPasswordForm />

      <p className={styles.backLink}>
        <Link href="/login" className={styles.link}>
          ログインに戻る
        </Link>
      </p>
    </div>
  );
}
