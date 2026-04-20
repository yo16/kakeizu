/**
 * POST /api/storage/signed-upload
 *
 * Supabase Storage への署名付きアップロード URL を発行する Route Handler。
 * api-design.md §4 の仕様に準拠。
 *
 * 処理フロー:
 * 1. 認証チェック
 * 2. 入力バリデーション (treeId, fileName, contentType, byteSize)
 * 3. ツリー所有権確認
 * 4. プラン上限チェック (写真枚数)
 * 5. MIME タイプ・ファイルサイズの検証
 * 6. objectKey を生成し Supabase Storage の署名付き URL を発行
 *
 * レスポンス: { ok: true, data: { uploadUrl, objectKey } }
 */
import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

import { signedUploadRequestSchema } from '@/features/photo/schemas';

/** ファイルサイズ上限: 5 MB (supabase-design.md §4) */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** MIME タイプから拡張子を取得する */
function getExtFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

export async function POST(request: NextRequest) {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' } },
      { status: 401 }
    );
  }

  // リクエストボディの解析
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'リクエストボディの解析に失敗しました' },
      },
      { status: 400 }
    );
  }

  // 入力バリデーション
  const parsed = signedUploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: firstError.message,
          field: firstError.path[0]?.toString(),
        },
      },
      { status: 400 }
    );
  }

  const { treeId, contentType, byteSize } = parsed.data;
  const userId = session.user.id;

  // ファイルサイズ検証 (5 MB 以内)
  if (byteSize > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `ファイルサイズは ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB 以内にしてください`,
          field: 'byteSize',
        },
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // ツリー所有権確認
  const { data: tree, error: treeError } = await supabase
    .from('tree')
    .select('id')
    .eq('id', treeId)
    .eq('owner_user_id', userId)
    .single();

  if (treeError || !tree) {
    return NextResponse.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'このツリーへのアクセス権がありません' } },
      { status: 403 }
    );
  }

  // NOTE: プラン上限チェック (写真枚数) は personId ベースのため (checkPhotoLimit)、
  // 署名 URL 発行時点では personId が確定していない。
  // 上限チェックは registerPhotoAfterUpload Server Action 側で personId が確定した後に実施する。

  // objectKey を生成 (supabase-design.md §4 命名規則: photos/{ownerUserId}/{treeId}/{photoId}.{ext})
  // photoId はここでは DB の UUID ではなく一時的な UUID を生成する
  // (実際の DB 挿入は registerPhotoAfterUpload で行われる)
  const crypto = await import('crypto');
  const tempPhotoId = crypto.randomUUID();
  const ext = getExtFromMimeType(contentType);
  const objectKey = `${userId}/${treeId}/${tempPhotoId}.${ext}`;

  // Supabase Storage の署名付きアップロード URL を発行
  const { data: signedData, error: signedError } = await supabase.storage
    .from('photos')
    .createSignedUploadUrl(objectKey, { upsert: false });

  if (signedError || !signedData) {
    console.error('[signed-upload] createSignedUploadUrl error:', signedError);
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: '署名付き URL の発行に失敗しました' } },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        uploadUrl: signedData.signedUrl,
        objectKey,
      },
    },
    { status: 200 }
  );
}
