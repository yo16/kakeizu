'use client';

import styles from './AppHeader.module.css';

interface AppHeaderProps {
  isNavOpen: boolean;
  onToggleNav: () => void;
}

export function AppHeader({ isNavOpen, onToggleNav }: AppHeaderProps) {
  return (
    <header className={styles.header} role="banner">
      <div className={styles.container}>
        <div className={styles.logo}>家系図</div>
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
          {/* 後続タスクでリンクを追加、MVPでは空で OK */}
        </nav>
      </div>
    </header>
  );
}
