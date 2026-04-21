import Link from 'next/link';

import styles from './EmailVerificationNotice.module.css';

interface EmailVerificationNoticeProps {
  email: string;
}

/**
 * メール確認案内コンポーネント
 * サインアップ成功後に表示する。
 */
export function EmailVerificationNotice({ email }: EmailVerificationNoticeProps) {
  return (
    <div className={styles.container} role="status" aria-live="polite">
      <div className={styles.iconWrapper} aria-hidden="true">
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="48" height="48" rx="24" fill="var(--color-brand-100)" />
          <path
            d="M12 18a2 2 0 0 1 2-2h20a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V18z"
            stroke="var(--color-brand-500)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M12 18l12 9 12-9"
            stroke="var(--color-brand-500)"
            strokeWidth="2"
            fill="none"
          />
        </svg>
      </div>
      <h2 className={styles.title}>確認メールを送信しました</h2>
      <p className={styles.description}>
        <strong className={styles.email}>{email}</strong>{' '}
        にメール確認リンクを送信しました。メールを開いてリンクをクリックして登録を完了してください。
      </p>
      <p className={styles.note}>
        メールが届かない場合は、迷惑メールフォルダをご確認ください。
      </p>
      <Link href="/login" className={styles.backLink}>
        ログイン画面に戻る
      </Link>
    </div>
  );
}
