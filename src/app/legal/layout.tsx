import Link from 'next/link';
import styles from './legal.module.css';

interface LegalLayoutProps {
  children: React.ReactNode;
}

export default function LegalLayout({ children }: LegalLayoutProps) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link href="/" className={styles.backLink}>
          ← トップに戻る
        </Link>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
