import styles from './AuthShell.module.css';

interface AuthShellProps {
  children: React.ReactNode;
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className={styles.shell}>
      <main className={styles.main} role="main">
        {children}
      </main>
    </div>
  );
}
