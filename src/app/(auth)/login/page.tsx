import type { Metadata } from 'next';
import Link from 'next/link';

import { GoogleSignInButton } from '@/features/auth/components/GoogleSignInButton';
import { LoginForm } from '@/features/auth/components/LoginForm';

import styles from './login.module.css';

export const metadata: Metadata = {
  title: 'ログイン | kakeizu',
  description: 'kakeizuにログインする',
};

export default function LoginPage() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>ログイン</h1>

      <GoogleSignInButton />

      <div className={styles.divider} aria-hidden="true">
        <span className={styles.dividerText}>または</span>
      </div>

      <LoginForm />

      <p className={styles.forgotPassword}>
        <Link href="/forgot-password" className={styles.link}>
          パスワードを忘れた方はこちら
        </Link>
      </p>

      <p className={styles.signupLink}>
        アカウントをお持ちでない方は{' '}
        <Link href="/signup" className={styles.link}>
          新規登録
        </Link>
      </p>
    </div>
  );
}
