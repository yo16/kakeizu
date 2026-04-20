/**
 * Relation ドメイン zod スキーマ定義
 *
 * Server Actions とクライアントフォームで共通利用する。
 * api-design.md §3 Relation セクションの仕様に準拠。
 */
import { z } from 'zod';

/** 親子関係の親の役割 */
export const parentRoleSchema = z.enum(['biological', 'adoptive', 'step'], {
  required_error: '親の役割を選択してください',
});

/** 婚姻種別 */
export const marriageTypeSchema = z.enum(['spouse', 'common_law', 'same_sex_partner'], {
  required_error: '婚姻種別を選択してください',
});

/** 婚姻状態 */
export const marriageStatusSchema = z.enum(['current', 'divorced', 'widowed'], {
  required_error: '婚姻状態を選択してください',
});

/** 年のバリデーション (1000-9999 or null) */
const yearSchema = z
  .number({ invalid_type_error: '数値で入力してください' })
  .int()
  .min(1000, { message: '1000年以降を入力してください' })
  .max(9999, { message: '9999年以前を入力してください' })
  .nullable()
  .optional();

/** 月のバリデーション (1-12 or null) */
const monthSchema = z
  .number({ invalid_type_error: '数値で入力してください' })
  .int()
  .min(1, { message: '1〜12 の範囲で入力してください' })
  .max(12, { message: '1〜12 の範囲で入力してください' })
  .nullable()
  .optional();

/** createParentChild Server Action 入力スキーマ */
export const createParentChildSchema = z.object({
  parentId: z.string().uuid({ message: '有効な人物IDを指定してください' }),
  childId: z.string().uuid({ message: '有効な人物IDを指定してください' }),
  parentRole: parentRoleSchema,
  note: z.string().max(1000, { message: 'メモは1000文字以内で入力してください' }).optional(),
});

/** createMarriage Server Action 入力スキーマ */
export const createMarriageSchema = z.object({
  partnerAId: z.string().uuid({ message: '有効な人物IDを指定してください' }),
  partnerBId: z.string().uuid({ message: '有効な人物IDを指定してください' }),
  type: marriageTypeSchema,
  status: marriageStatusSchema,
  startYear: yearSchema,
  startMonth: monthSchema,
  endYear: yearSchema,
  endMonth: monthSchema,
  note: z.string().max(1000, { message: 'メモは1000文字以内で入力してください' }).optional(),
});

export type ParentRole = z.infer<typeof parentRoleSchema>;
export type MarriageType = z.infer<typeof marriageTypeSchema>;
export type MarriageStatus = z.infer<typeof marriageStatusSchema>;
export type CreateParentChildInput = z.infer<typeof createParentChildSchema>;
export type CreateMarriageInput = z.infer<typeof createMarriageSchema>;
