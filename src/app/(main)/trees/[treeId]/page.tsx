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
import { getPhotoUrl } from '@/features/photo/utils/getPhotoUrl';
import { getTreeOverview } from '@/features/tree/actions/get-tree-overview';
import type { PersonNodePhoto } from '@/features/tree/types';
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

  // 人物・関係・写真・ツリー概要を並列取得
  const [personsResult, relationsResult, photosResult, treeOverviewResult] = await Promise.all([
    listPersons({ treeId }),
    listRelations({ treeId }),
    getPhotos({ treeId }),
    getTreeOverview({ treeId }),
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
  const treeTitle = treeOverviewResult.ok ? treeOverviewResult.data.tree.title : null;

  // 写真を person 単位にまとめ、URL を解決して photosByPersonId マップを構築する。
  // person に紐づく写真が存在する場合のみ URL 解決を行う (不要な署名付き URL 生成を抑制)。
  const photosByPersonId: Record<string, PersonNodePhoto[]> = {};

  if (photos.length > 0) {
    // 全写真の URL を並列解決する
    const resolvedPhotos = await Promise.all(
      photos.map(async (photo) => {
        try {
          const url = await getPhotoUrl(photo.storageObjectKey, { preset: 'thumbnail' });
          return { photo, url };
        } catch {
          // URL 解決に失敗した写真は無視する (ツリー表示を止めない)
          return null;
        }
      })
    );

    // personId → PersonNodePhoto[] のマップを構築
    for (const resolved of resolvedPhotos) {
      if (!resolved) continue;
      const { photo, url } = resolved;
      for (const personId of photo.personIds) {
        if (!photosByPersonId[personId]) {
          photosByPersonId[personId] = [];
        }
        photosByPersonId[personId].push({
          id: photo.id,
          url,
          takenYear: photo.takenYear,
        });
      }
    }
  }

  return (
    <div className={styles.page}>
      <Suspense fallback={<div className={styles.loading}>読み込み中...</div>}>
        <TreeCanvasWithPanel
          treeId={treeId}
          treeTitle={treeTitle}
          persons={persons}
          photos={photos}
          relations={relations}
          photosByPersonId={photosByPersonId}
        />
      </Suspense>
    </div>
  );
}
