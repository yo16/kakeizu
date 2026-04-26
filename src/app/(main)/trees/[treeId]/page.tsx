/**
 * ツリー編集ページ (Server Component)
 *
 * /trees/[treeId]
 *
 * - ツリー内の全人物・関係・写真を並列取得
 * - TreeCanvasWithPanel に渡す
 * - FORBIDDEN / NOT_FOUND の場合は notFound() を呼ぶ
 *
 * Next.js 15 App Router: params は Promise<> 型
 */

import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import type { Metadata } from 'next';

import { listPersons } from '@/features/person/actions/list-persons';
import { listRelations } from '@/features/relation/actions/list-relations';
import { getPhotos } from '@/features/photo/actions/get-photos';
import { TreeCanvasWithPanel } from '@/features/tree/components/TreeCanvasWithPanel';

import styles from './page.module.css';

interface PageParams {
  treeId: string;
}

interface TreeEditorPageProps {
  params: Promise<PageParams>;
}

export async function generateMetadata(
  { params }: TreeEditorPageProps
): Promise<Metadata> {
  const { treeId } = await params;
  return {
    title: '家系図',
    description: `家系図 (${treeId}) の編集`,
  };
}

export default async function TreeEditorPage({ params }: TreeEditorPageProps) {
  const { treeId } = await params;

  // 人物・関係・写真を並列取得
  const [personsResult, relationsResult, photosResult] = await Promise.all([
    listPersons({ treeId }),
    listRelations({ treeId }),
    getPhotos({ treeId }),
  ]);

  // アクセス権がない場合は 404
  if (!personsResult.ok) {
    if (personsResult.error.code === 'FORBIDDEN' || personsResult.error.code === 'NOT_FOUND') {
      notFound();
    }
  }

  const persons = personsResult.ok ? personsResult.data : [];
  const relations = relationsResult.ok ? relationsResult.data.relations : [];
  const photos = photosResult.ok ? photosResult.data : [];

  return (
    <div className={styles.page}>
      <Suspense fallback={<div className={styles.loading}>読み込み中...</div>}>
        <TreeCanvasWithPanel
          treeId={treeId}
          persons={persons}
          photos={photos}
          relations={relations}
        />
      </Suspense>
    </div>
  );
}
