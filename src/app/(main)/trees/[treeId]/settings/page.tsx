/**
 * ツリー設定ページ — Server Component
 *
 * getTreeOverview() でツリー情報を取得し、
 * タイトル・説明の編集フォーム (TreeSettingsForm) と基本情報を表示する。
 *
 * データ取得失敗・RLS 404 の場合は notFound() で 404 ページへ。
 */
import { notFound } from 'next/navigation';

import { getTreeOverview } from '@/features/tree/actions/get-tree-overview';
import { TreeSettingsForm } from '@/features/tree/components/TreeSettingsForm';

import styles from './page.module.css';

interface TreeSettingsPageProps {
  params: Promise<{ treeId: string }>;
}

export default async function TreeSettingsPage({ params }: TreeSettingsPageProps) {
  const { treeId } = await params;

  const result = await getTreeOverview({ treeId });

  if (!result.ok) {
    notFound();
  }

  const { tree, counts } = result.data;

  const createdAt = new Date(tree.createdAt).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>ツリー設定</h1>

      {/* 基本情報 */}
      <section className={styles.section} aria-label="基本情報">
        <h2 className={styles.sectionHeading}>基本情報</h2>
        <dl className={styles.infoList}>
          <div className={styles.infoItem}>
            <dt className={styles.infoLabel}>作成日</dt>
            <dd className={styles.infoValue}>{createdAt}</dd>
          </div>
          <div className={styles.infoItem}>
            <dt className={styles.infoLabel}>人物数</dt>
            <dd className={styles.infoValue}>{counts.persons} 人</dd>
          </div>
          <div className={styles.infoItem}>
            <dt className={styles.infoLabel}>写真数</dt>
            <dd className={styles.infoValue}>{counts.photos} 枚</dd>
          </div>
        </dl>
      </section>

      {/* タイトル・説明の編集フォーム */}
      <section className={styles.section} aria-label="タイトル・説明の編集">
        <h2 className={styles.sectionHeading}>タイトル・説明</h2>
        <TreeSettingsForm
          treeId={tree.id}
          defaultValues={{
            title: tree.title,
            description: tree.description,
          }}
        />
      </section>
    </main>
  );
}
