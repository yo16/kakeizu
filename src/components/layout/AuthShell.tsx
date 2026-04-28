import styles from './AuthShell.module.css';
import { Footer } from './Footer';

interface AuthShellProps {
  children: React.ReactNode;
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className={styles.shell}>
      <main className={styles.main} role="main">
        {children}
      </main>
      <Footer />
    </div>
  );
}
