import Link from 'next/link';
import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.footer} role="contentinfo">
      <nav className={styles.nav} aria-label="法的情報">
        <Link href="/legal/terms" className={styles.link}>
          利用規約
        </Link>
        <Link href="/legal/privacy" className={styles.link}>
          プライバシーポリシー
        </Link>
      </nav>
      <p className={styles.copyright}>© 2026 kakeizu</p>
    </footer>
  );
}
