/**
 * Billing ドメイン zod スキーマ定義
 *
 * Server Actions とクライアントフォームで共通利用する。
 * billing-design.md §3 の仕様に準拠。
 */
import { z } from 'zod';

/** createCheckoutSession Server Action 入力スキーマ */
export const createCheckoutSessionSchema = z.object({
  priceId: z.string().min(1, { message: '価格IDを指定してください' }),
});

export type CreateCheckoutSessionInput = z.infer<
  typeof createCheckoutSessionSchema
>;
