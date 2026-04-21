import Link from 'next/link';

import { type TreeListItem } from '../actions/list-trees';
import styles from './TreeCard.module.css';

interface TreeCardProps {
  tree: TreeListItem;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function TreeCard({ tree }: TreeCardProps) {
  return (
    <Link href={`/trees/${tree.id}`} className={styles.card}>
      <h2 className={styles.title}>{tree.title}</h2>
      {tree.description && (
        <p className={styles.description}>{tree.description}</p>
      )}
      <div className={styles.meta}>
        <span className={styles.personCount}>
          <span aria-label="人物数">{tree.personCount}</span>
          <span className={styles.metaLabel}>人</span>
        </span>
        <span className={styles.updatedAt}>
          更新日: {formatDate(tree.updatedAt)}
        </span>
      </div>
    </Link>
  );
}
