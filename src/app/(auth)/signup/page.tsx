import type { Metadata } from 'next';
import Link from 'next/link';

import { GoogleSignInButton } from '@/features/auth/components/GoogleSignInButton';
import { SignupForm } from '@/features/auth/components/SignupForm';

import styles from './signup.module.css';

export const metadata: Metadata = {
  title: 'アカウント作成 | kakeizu',
  description: 'kakeizuに新規登録する',
};

export default function SignupPage() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>アカウント作成</h1>

      <GoogleSignInButton />

      <div className={styles.divider} aria-hidden="true">
        <span className={styles.dividerText}>または</span>
      </div>

      <SignupForm />

      <p className={styles.loginLink}>
        すでにアカウントをお持ちの方は{' '}
        <Link href="/login" className={styles.link}>
          ログイン
        </Link>
      </p>
    </div>
  );
}
