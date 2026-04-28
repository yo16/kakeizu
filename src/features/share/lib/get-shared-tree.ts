import 'server-only';

/**
 * 共有トークンからツリー全データを Service Role で取得するヘルパー。
 *
 * RLS をバイパスするために Service Role クライアントを使用する。
 * 通常の認証クライアントでは share_link テーブルへの公開アクセスができないため。
 *
 * - share_link が存在しない、is_enabled=false、revoked_at NOT NULL → null
 * - ツリーが存在 (CASCADE 削除されていない) かつ link が有効 → SharedTreeData
 *
 * generateMetadata と page 両方から呼ばれるため React `cache` でメモ化する。
 */
import { cache } from 'react';

import { createServiceRoleClient } from '@/lib/supabase/server';

export interface SharedTree {
  id: string;
  name: string;
  description: string | null;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SharedPerson {
  id: string;
  treeId: string;
  displayName: string;
  familyName: string | null;
  givenName: string | null;
  maidenName: string | null;
  gender: string | null;
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
  birthPlace: string | null;
  deathYear: number | null;
  deathMonth: number | null;
  deathDay: number | null;
  deathPlace: string | null;
  isAlive: boolean;
  note: string | null;
  primaryPhotoId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SharedRelation {
  id: string;
  treeId: string;
  kind: 'parent_child' | 'marriage';
  fromPersonId: string;
  toPersonId: string;
  parentRole: string | null;
  marriageType: string | null;
  marriageStatus: string | null;
  startYear: number | null;
  startMonth: number | null;
  endYear: number | null;
  endMonth: number | null;
  note: string | null;
  createdAt: string;
}

export interface SharedPhoto {
  id: string;
  storageObjectKey: string;
  mimeType: string | null;
  byteSize: number | null;
  takenYear: number | null;
  takenMonth: number | null;
  takenDay: number | null;
  caption: string | null;
  personIds: string[];
  createdAt: string;
}

export interface SharedTreeData {
  tree: SharedTree;
  persons: SharedPerson[];
  relations: SharedRelation[];
  photos: SharedPhoto[];
}

/**
 * トークンから共有ツリーを取得する。
 *
 * @param token - 共有 URL のトークン
 * @returns SharedTreeData (有効) または null (無効・不在)
 */
export const getSharedTree = cache(async (token: string): Promise<SharedTreeData | null> => {
  const supabase = createServiceRoleClient();

  // 1. share_link をトークンで検索 (is_enabled=true, revoked_at IS NULL のみ)
  const { data: link, error: linkError } = await supabase
    .from('share_link')
    .select('id, tree_id, is_enabled, revoked_at')
    .eq('token', token)
    .eq('is_enabled', true)
    .is('revoked_at', null)
    .maybeSingle();

  if (linkError) {
    console.error('[getSharedTree] share_link 取得エラー:', linkError);
    return null;
  }
  if (!link) {
    return null;
  }

  const treeId = link.tree_id;

  // 2. tree / persons / relations / photos を並列取得 (Service Role = RLS バイパス)
  const [treeRes, personsRes, relationsRes, photosRes] = await Promise.all([
    supabase
      .from('tree')
      .select('id, name, description, owner_user_id, created_at, updated_at')
      .eq('id', treeId)
      .maybeSingle(),
    supabase
      .from('person')
      .select(
        'id, tree_id, display_name, family_name, given_name, maiden_name, gender, birth_year, birth_month, birth_day, birth_place, death_year, death_month, death_day, death_place, is_alive, note, primary_photo_id, created_at, updated_at'
      )
      .eq('tree_id', treeId)
      .order('display_name', { ascending: true }),
    supabase
      .from('relation')
      .select(
        'id, tree_id, kind, from_person_id, to_person_id, parent_role, marriage_type, marriage_status, start_year, start_month, end_year, end_month, note, created_at'
      )
      .eq('tree_id', treeId)
      .order('created_at', { ascending: true }),
    supabase
      .from('photo')
      .select(
        `
        id,
        storage_object_key,
        mime_type,
        byte_size,
        taken_year,
        taken_month,
        taken_day,
        caption,
        created_at,
        photo_person_link (
          person_id
        )
      `
      )
      .eq('tree_id', treeId)
      .order('created_at', { ascending: false }),
  ]);

  // ツリーが存在しない場合 (CASCADE 削除済み等) は null を返す
  if (treeRes.error) {
    console.error('[getSharedTree] tree 取得エラー:', treeRes.error);
    return null;
  }
  if (!treeRes.data) {
    return null;
  }

  const tree = treeRes.data;

  const persons: SharedPerson[] = (personsRes.data ?? []).map((p) => ({
    id: p.id,
    treeId: p.tree_id,
    displayName: p.display_name,
    familyName: p.family_name ?? null,
    givenName: p.given_name ?? null,
    maidenName: p.maiden_name ?? null,
    gender: p.gender ?? null,
    birthYear: p.birth_year ?? null,
    birthMonth: p.birth_month ?? null,
    birthDay: p.birth_day ?? null,
    birthPlace: p.birth_place ?? null,
    deathYear: p.death_year ?? null,
    deathMonth: p.death_month ?? null,
    deathDay: p.death_day ?? null,
    deathPlace: p.death_place ?? null,
    isAlive: p.is_alive,
    note: p.note ?? null,
    primaryPhotoId: p.primary_photo_id ?? null,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));

  const relations: SharedRelation[] = (relationsRes.data ?? []).map((r) => ({
    id: r.id,
    treeId: r.tree_id,
    kind: r.kind as 'parent_child' | 'marriage',
    fromPersonId: r.from_person_id,
    toPersonId: r.to_person_id,
    parentRole: r.parent_role ?? null,
    marriageType: r.marriage_type ?? null,
    marriageStatus: r.marriage_status ?? null,
    startYear: r.start_year ?? null,
    startMonth: r.start_month ?? null,
    endYear: r.end_year ?? null,
    endMonth: r.end_month ?? null,
    note: r.note ?? null,
    createdAt: r.created_at,
  }));

  const photos: SharedPhoto[] = (photosRes.data ?? []).map((p) => ({
    id: p.id,
    storageObjectKey: p.storage_object_key,
    mimeType: p.mime_type ?? null,
    byteSize: p.byte_size ?? null,
    takenYear: p.taken_year ?? null,
    takenMonth: p.taken_month ?? null,
    takenDay: p.taken_day ?? null,
    caption: p.caption ?? null,
    personIds: (p.photo_person_link ?? []).map(
      (link: { person_id: string }) => link.person_id
    ),
    createdAt: p.created_at,
  }));

  return {
    tree: {
      id: tree.id,
      name: tree.name,
      description: tree.description ?? null,
      ownerUserId: tree.owner_user_id,
      createdAt: tree.created_at,
      updatedAt: tree.updated_at,
    },
    persons,
    relations,
    photos,
  };
});
