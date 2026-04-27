'use client';

import styles from './OverLimitBanner.module.css';

export interface OverageEntry {
  resource: 'tree' | 'person' | 'photo';
  current: number;
  limit: number;
}

interface OverLimitBannerProps {
  overages: OverageEntry[];
}

const RESOURCE_LABELS: Record<OverageEntry['resource'], string> = {
  tree: '家系図',
  person: '人物',
  photo: '写真',
};

export function OverLimitBanner({ overages }: OverLimitBannerProps) {
  if (overages.length === 0) {
    return null;
  }

  return (
    <div className={styles.banner} role="alert" aria-live="polite">
      <div className={styles.iconWrapper} aria-hidden="true">
        ⚠️
      </div>
      <div className={styles.content}>
        <p className={styles.title}>利用上限を超過しています</p>
        <ul className={styles.list}>
          {overages.map((o) => (
            <li key={o.resource} className={styles.item}>
              {RESOURCE_LABELS[o.resource]}: {o.current} / {o.limit} 件
            </li>
          ))}
        </ul>
        <p className={styles.description}>
          プランをアップグレードするか、データを削除して上限内に収めてください。
          <a href="#plan-comparison" className={styles.ctaLink}>
            プランを確認する
          </a>
        </p>
      </div>
    </div>
  );
}
