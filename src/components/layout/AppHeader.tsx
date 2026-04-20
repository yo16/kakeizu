'use client';

import Link from 'next/link';
import { LogoutButton } from '@/features/account/components/LogoutButton';
import styles from './AppHeader.module.css';

interface AppHeaderProps {
  isNavOpen: boolean;
  onToggleNav: () => void;
}

export function AppHeader({ isNavOpen, onToggleNav }: AppHeaderProps) {
  return (
    <header className={styles.header} role="banner">
      <div className={styles.container}>
        <Link href="/dashboard" className={styles.logo}>
          家系図
        </Link>
        <button
          type="button"
          className={styles.menuToggle}
          aria-label={isNavOpen ? 'メニューを閉じる' : 'メニューを開く'}
          aria-expanded={isNavOpen}
          onClick={onToggleNav}
        >
          ☰
        </button>
        <nav
          className={`${styles.nav} ${isNavOpen ? styles.navOpen : ''}`}
          aria-label="メインナビゲーション"
        >
          <Link href="/dashboard" className={styles.navLink}>
            ダッシュボード
          </Link>
          <Link href="/account" className={styles.navLink}>
            アカウント
          </Link>
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
