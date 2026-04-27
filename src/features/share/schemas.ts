/**
 * Share ドメイン zod スキーマ定義
 *
 * Server Actions とクライアントフォームで共通利用する。
 */
import { z } from 'zod';

/** createShareLink Server Action 入力スキーマ */
export const createShareLinkSchema = z.object({
  treeId: z.string().uuid({ message: '有効なツリーIDを指定してください' }),
});

/** revokeShareLink Server Action 入力スキーマ */
export const revokeShareLinkSchema = z.object({
  linkId: z.string().uuid({ message: '有効なリンクIDを指定してください' }),
});

export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;
export type RevokeShareLinkInput = z.infer<typeof revokeShareLinkSchema>;
