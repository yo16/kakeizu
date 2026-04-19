import type { Metadata } from 'next';
import Link from 'next/link';

import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm';

import styles from './forgot-password.module.css';

export const metadata: Metadata = {
  title: 'パスワードをリセット | kakeizu',
  description: 'パスワードリセット用のメールを送信します',
};

export default function ForgotPasswordPage() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>パスワードをリセット</h1>

      <p className={styles.description}>
        登録済みのメールアドレスを入力してください。パスワードリセット用のリンクをお送りします。
      </p>

      <ForgotPasswordForm />

      <p className={styles.backLink}>
        <Link href="/login" className={styles.link}>
          ログインに戻る
        </Link>
      </p>
    </div>
  );
}
