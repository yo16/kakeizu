import { getServerSession } from '@/lib/auth/session';
import { MainShell } from '@/components/layout/MainShell';
import { LogoutButton } from '@/features/account/components/LogoutButton';
import { DeleteAccountButton } from '@/features/account/components/DeleteAccountButton';
import styles from './page.module.css';

export default async function AccountPage() {
  // (main)/layout.tsx で認証済みが保証されているが、プロフィール表示のためユーザー情報を取得
  const session = await getServerSession();
  const user = session?.user;

  const displayName = user?.user_metadata?.display_name as string | undefined;
  const email = user?.email ?? '';

  return (
    <MainShell>
      <div className={styles.container}>
        <h1 className={styles.heading}>アカウント設定</h1>

        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>プロフィール</h2>
          <dl className={styles.profileList}>
            <div className={styles.profileItem}>
              <dt className={styles.profileLabel}>メール</dt>
              <dd className={styles.profileValue}>{email}</dd>
            </div>
            <div className={styles.profileItem}>
              <dt className={styles.profileLabel}>表示名</dt>
              <dd className={styles.profileValue}>{displayName ?? '未設定'}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>操作</h2>
          <div className={styles.actions}>
            <LogoutButton />
          </div>
        </section>

        <section className={`${styles.section} ${styles.dangerZone}`}>
          <h2 className={styles.sectionHeading}>危険な操作</h2>
          <p className={styles.dangerDescription}>
            アカウントを削除すると、すべてのデータが完全に削除されます。この操作は取り消せません。
          </p>
          <div className={styles.actions}>
            <DeleteAccountButton userEmail={email} />
          </div>
        </section>
      </div>
    </MainShell>
  );
}
