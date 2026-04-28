'use client';

import { useState } from 'react';
import styles from './MainShell.module.css';
import { AppHeader } from './AppHeader';
import { Footer } from './Footer';

interface MainShellProps {
  children: React.ReactNode;
}

export function MainShell({ children }: MainShellProps) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  return (
    <div className={styles.shell}>
      <AppHeader isNavOpen={isNavOpen} onToggleNav={() => setIsNavOpen(v => !v)} />
      <main className={styles.main} role="main">
        {children}
      </main>
      <Footer />
    </div>
  );
}
