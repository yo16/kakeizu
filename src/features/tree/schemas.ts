/**
 * Tree ドメイン zod スキーマ定義
 *
 * Server Actions とクライアントフォームで共通利用する。
 * api-design.md §3 Tree セクションの仕様に準拠。
 */
import { z } from 'zod';

/** createTree Server Action 入力スキーマ */
export const treeCreateSchema = z.object({
  title: z
    .string({ required_error: 'タイトルを入力してください' })
    .min(1, { message: 'タイトルを入力してください' })
    .max(100, { message: 'タイトルは100文字以内で入力してください' }),
  description: z
    .string()
    .max(500, { message: '説明は500文字以内で入力してください' })
    .optional(),
});

/** updateTree Server Action 入力スキーマ */
export const treeUpdateSchema = z.object({
  treeId: z.string().uuid({ message: '有効なツリーIDを指定してください' }),
  title: z
    .string()
    .min(1, { message: 'タイトルを入力してください' })
    .max(100, { message: 'タイトルは100文字以内で入力してください' })
    .optional(),
  description: z
    .string()
    .max(500, { message: '説明は500文字以内で入力してください' })
    .optional(),
});

export type TreeCreateInput = z.infer<typeof treeCreateSchema>;
export type TreeUpdateInput = z.infer<typeof treeUpdateSchema>;
