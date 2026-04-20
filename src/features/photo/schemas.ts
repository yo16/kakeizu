/**
 * Photo ドメイン zod スキーマ定義
 *
 * Server Actions とクライアントフォームで共通利用する。
 * api-design.md §3 Photo セクションの仕様に準拠。
 * db-design.md の photo テーブル制約に準拠。
 */
import { z } from 'zod';

/** 受け入れ可能な MIME タイプ */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** registerPhotoAfterUpload Server Action 入力スキーマ */
export const registerPhotoAfterUploadSchema = z.object({
  treeId: z.string().uuid({ message: '有効なツリーIDを指定してください' }),
  storageObjectKey: z
    .string()
    .min(1, { message: 'ストレージオブジェクトキーを指定してください' }),
  mimeType: z
    .enum(ALLOWED_MIME_TYPES, {
      invalid_type_error: 'MIME タイプは image/jpeg, image/png, image/webp のいずれかを指定してください',
    })
    .optional(),
  byteSize: z.number().int().positive().optional(),
  takenYear: z
    .number({ invalid_type_error: '撮影年は数値で入力してください' })
    .int()
    .min(1000, { message: '撮影年は1000以上で入力してください' })
    .max(9999, { message: '撮影年は9999以下で入力してください' })
    .nullable()
    .optional(),
  takenMonth: z
    .number({ invalid_type_error: '撮影月は数値で入力してください' })
    .int()
    .min(1, { message: '撮影月は1〜12で入力してください' })
    .max(12, { message: '撮影月は1〜12で入力してください' })
    .nullable()
    .optional(),
  takenDay: z
    .number({ invalid_type_error: '撮影日は数値で入力してください' })
    .int()
    .min(1, { message: '撮影日は1〜31で入力してください' })
    .max(31, { message: '撮影日は1〜31で入力してください' })
    .nullable()
    .optional(),
  caption: z
    .string()
    .max(1000, { message: 'キャプションは1000文字以内で入力してください' })
    .nullable()
    .optional(),
  personIds: z
    .array(z.string().uuid({ message: '有効な人物IDを指定してください' }))
    .optional(),
});

/** updatePhotoMeta Server Action 入力スキーマ */
export const updatePhotoMetaSchema = z
  .object({
    photoId: z.string().uuid({ message: '有効な写真IDを指定してください' }),
    takenYear: z
      .number({ invalid_type_error: '撮影年は数値で入力してください' })
      .int()
      .min(1000, { message: '撮影年は1000以上で入力してください' })
      .max(9999, { message: '撮影年は9999以下で入力してください' })
      .nullable()
      .optional(),
    takenMonth: z
      .number({ invalid_type_error: '撮影月は数値で入力してください' })
      .int()
      .min(1, { message: '撮影月は1〜12で入力してください' })
      .max(12, { message: '撮影月は1〜12で入力してください' })
      .nullable()
      .optional(),
    takenDay: z
      .number({ invalid_type_error: '撮影日は数値で入力してください' })
      .int()
      .min(1, { message: '撮影日は1〜31で入力してください' })
      .max(31, { message: '撮影日は1〜31で入力してください' })
      .nullable()
      .optional(),
    caption: z
      .string()
      .max(1000, { message: 'キャプションは1000文字以内で入力してください' })
      .nullable()
      .optional(),
    personIds: z
      .array(z.string().uuid({ message: '有効な人物IDを指定してください' }))
      .optional(),
  })
  .refine(
    (data) => {
      // 最低1フィールドは指定が必要 (photoId 以外)
      const { photoId: _, ...rest } = data;
      void _;
      return Object.values(rest).some((v) => v !== undefined);
    },
    { message: '更新するフィールドを少なくとも1つ指定してください' }
  );

/** deletePhoto Server Action 入力スキーマ */
export const deletePhotoSchema = z.object({
  photoId: z.string().uuid({ message: '有効な写真IDを指定してください' }),
});

/** getPhotos Server Action 入力スキーマ */
export const getPhotosSchema = z.object({
  treeId: z.string().uuid({ message: '有効なツリーIDを指定してください' }),
});

/** /api/storage/signed-upload Route Handler 入力スキーマ */
export const signedUploadRequestSchema = z.object({
  treeId: z.string().uuid({ message: '有効なツリーIDを指定してください' }),
  fileName: z
    .string()
    .min(1, { message: 'ファイル名を指定してください' })
    .max(255, { message: 'ファイル名は255文字以内で指定してください' }),
  contentType: z.enum(ALLOWED_MIME_TYPES, {
    invalid_type_error:
      'Content-Type は image/jpeg, image/png, image/webp のいずれかを指定してください',
  }),
  byteSize: z
    .number({ invalid_type_error: 'byteSize は数値で指定してください' })
    .int()
    .positive({ message: 'byteSize は正の整数で指定してください' }),
});

export type RegisterPhotoAfterUploadInput = z.infer<typeof registerPhotoAfterUploadSchema>;
export type UpdatePhotoMetaInput = z.infer<typeof updatePhotoMetaSchema>;
export type DeletePhotoInput = z.infer<typeof deletePhotoSchema>;
export type GetPhotosInput = z.infer<typeof getPhotosSchema>;
export type SignedUploadRequest = z.infer<typeof signedUploadRequestSchema>;
