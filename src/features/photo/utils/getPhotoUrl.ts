import { createClient } from '@/lib/supabase/server';

export type PhotoTransformPreset = 'thumbnail' | 'detail' | 'full';

export interface GetPhotoUrlOptions {
  preset?: PhotoTransformPreset;
  expiresIn?: number; // 秒、デフォルト 3600
}

type TransformOptions = {
  width: number;
  height: number;
  resize: 'cover' | 'contain';
};

const PRESETS: Record<PhotoTransformPreset, TransformOptions> = {
  thumbnail: { width: 96, height: 96, resize: 'cover' },
  detail: { width: 480, height: 480, resize: 'contain' },
  full: { width: 1280, height: 1280, resize: 'contain' },
};

/**
 * Supabase Image Transformation 付きの署名付き配信URLを生成する。
 * Server Component / Server Action から呼ぶこと（サーバー用 Supabase client を使用）。
 *
 * @param storagePath  objectKey（バケット名を含まない）
 * @returns 署名付きURL（有効期限付き）
 */
export async function getPhotoUrl(
  storagePath: string,
  options?: GetPhotoUrlOptions
): Promise<string> {
  const expiresIn = options?.expiresIn ?? 3600;
  const preset = options?.preset;

  const supabase = await createClient();

  const transform = preset ? PRESETS[preset] : undefined;

  const { data, error } = await supabase.storage
    .from('photos')
    .createSignedUrl(storagePath, expiresIn, transform ? { transform } : undefined);

  if (error || !data) {
    throw new Error(
      `Failed to create signed URL for "${storagePath}": ${error?.message ?? 'no data'}`
    );
  }

  return data.signedUrl;
}
