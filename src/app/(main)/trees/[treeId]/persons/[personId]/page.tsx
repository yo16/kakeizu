/**
 * 人物詳細ページ (Server Component + OGP対応)
 *
 * /trees/[treeId]/persons/[personId]
 *
 * - generateMetadata で人物名を title に設定
 * - getPerson / listRelations / getPhotos を並列取得
 * - PersonDetailPanel に渡す
 * - NOT_FOUND / FORBIDDEN の場合は notFound() を呼ぶ
 *
 * Next.js 15 App Router: params は Promise<> 型
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { getPerson } from '@/features/person/actions/get-person';
import { listRelations } from '@/features/relation/actions/list-relations';
import { getPhotos } from '@/features/photo/actions/get-photos';
import { PersonDetailPanel } from '@/features/person/components/PersonDetailPanel';

interface PageParams {
  treeId: string;
  personId: string;
}

interface PersonDetailPageProps {
  params: Promise<PageParams>;
}

export async function generateMetadata(
  { params }: PersonDetailPageProps
): Promise<Metadata> {
  const { personId } = await params;

  const result = await getPerson({ personId });
  if (!result.ok) {
    return { title: '人物詳細' };
  }

  return {
    title: result.data.displayName,
    description: `${result.data.displayName} の人物詳細`,
  };
}

export default async function PersonDetailPage({ params }: PersonDetailPageProps) {
  const { treeId, personId } = await params;

  // 人物・関係・写真を並列取得
  const [personResult, relationsResult, photosResult] = await Promise.all([
    getPerson({ personId }),
    listRelations({ treeId }),
    getPhotos({ treeId }),
  ]);

  // 人物が見つからない場合は 404
  if (!personResult.ok) {
    notFound();
  }

  const person = personResult.data;
  const relations = relationsResult.ok ? relationsResult.data.relations : [];
  const photos = photosResult.ok ? photosResult.data : [];

  return (
    <PersonDetailPanel
      treeId={treeId}
      person={person}
      photos={photos}
      relations={relations}
    />
  );
}
