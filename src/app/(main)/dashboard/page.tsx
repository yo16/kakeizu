/**
 * ダッシュボード — ツリー一覧 + 新規作成導線
 *
 * Server Component: listTrees() でツリー一覧を取得し、
 * クライアントインタラクション (モーダル開閉) は CreateTreeButton (Client Component) に委譲する。
 */
import { listTrees } from '@/features/tree/actions/list-trees';
import { CreateTreeButton } from '@/features/tree/components/CreateTreeButton';
import { TreeCard } from '@/features/tree/components/TreeCard';

import styles from './page.module.css';

export default async function DashboardPage() {
  const result = await listTrees();

  const trees = result.ok ? result.data : [];

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.heading}>あなたの家系図</h1>
        <CreateTreeButton />
      </div>

      {trees.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyStateTitle}>家系図がまだありません</p>
          <p className={styles.emptyStateDescription}>
            最初の家系図を作成しましょう。先祖や家族の記録をかんたんにまとめられます。
          </p>
          <CreateTreeButton label="最初の家系図を作成する" size="lg" />
        </div>
      ) : (
        <ul className={styles.list} aria-label="家系図一覧">
          {trees.map((tree) => (
            <li key={tree.id}>
              <TreeCard tree={tree} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
