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

/** updateRelation Server Action 入力スキーマ (親子) */
export const updateParentChildSchema = z.object({
  kind: z.literal('parent_child'),
  relationId: z.string().uuid({ message: '有効な関係IDを指定してください' }),
  parentRole: parentRoleSchema.optional(),
  note: z.string().max(1000, { message: 'メモは1000文字以内で入力してください' }).nullable().optional(),
});

/** updateRelation Server Action 入力スキーマ (婚姻) */
export const updateMarriageSchema = z.object({
  kind: z.literal('marriage'),
  relationId: z.string().uuid({ message: '有効な関係IDを指定してください' }),
  type: marriageTypeSchema.optional(),
  status: marriageStatusSchema.optional(),
  startYear: yearSchema,
  startMonth: monthSchema,
  endYear: yearSchema,
  endMonth: monthSchema,
  note: z.string().max(1000, { message: 'メモは1000文字以内で入力してください' }).nullable().optional(),
});

/** updateRelation Server Action 入力スキーマ (共通) */
export const updateRelationSchema = z.discriminatedUnion('kind', [
  updateParentChildSchema,
  updateMarriageSchema,
]);

/** deleteRelation Server Action 入力スキーマ */
export const deleteRelationSchema = z.object({
  relationId: z.string().uuid({ message: '有効な関係IDを指定してください' }),
});

/** quickAddRelative の kind */
export const relativeKindSchema = z.enum(['parent', 'child', 'spouse'], {
  required_error: '続柄を選択してください',
});

/** quickAddRelative Server Action 入力スキーマ */
export const quickAddRelativeSchema = z.object({
  originPersonId: z.string().uuid({ message: '有効な人物IDを指定してください' }),
  kind: relativeKindSchema,
  /**
   * kind === 'child' の場合のみ使用。
   * 複数配偶者がいる場合に「どの配偶者との子か」を指定する。
   * 指定すると、新規作成した子に対して originPersonId (親A) と
   * spousePersonId (親B) の両方との parent_child 関係を作成する。
   * kind !== 'child' の場合は無視される。
   */
  spousePersonId: z.string().uuid({ message: '有効な配偶者IDを指定してください' }).optional(),
  personDraft: z.object({
    displayName: z
      .string({ required_error: '名前を入力してください' })
      .min(1, { message: '名前を入力してください' })
      .max(200, { message: '名前は200文字以内で入力してください' }),
    familyName: z.string().max(100).nullable().optional(),
    givenName: z.string().max(100).nullable().optional(),
    maidenName: z.string().max(100).nullable().optional(),
    gender: z
      .enum(['male', 'female', 'other', 'unknown'], {
        invalid_type_error: '性別は male/female/other/unknown で指定してください',
      })
      .nullable()
      .optional(),
    birthYear: z.number().int().min(1000).max(9999).nullable().optional(),
    birthMonth: z.number().int().min(1).max(12).nullable().optional(),
    birthDay: z.number().int().min(1).max(31).nullable().optional(),
    birthPlace: z.string().max(200).nullable().optional(),
    deathYear: z.number().int().min(1000).max(9999).nullable().optional(),
    deathMonth: z.number().int().min(1).max(12).nullable().optional(),
    deathDay: z.number().int().min(1).max(31).nullable().optional(),
    deathPlace: z.string().max(200).nullable().optional(),
    isAlive: z.boolean().optional(),
    note: z.string().max(5000).nullable().optional(),
    // 配偶者として追加する場合に使う婚姻情報
    marriageType: marriageTypeSchema.optional(),
    marriageStatus: marriageStatusSchema.optional(),
    startYear: yearSchema,
    startMonth: monthSchema,
  }),
});

/** listRelations Server Action 入力スキーマ */
export const listRelationsSchema = z.object({
  treeId: z.string().uuid({ message: '有効なツリーIDを指定してください' }),
});

export type ParentRole = z.infer<typeof parentRoleSchema>;
export type MarriageType = z.infer<typeof marriageTypeSchema>;
export type MarriageStatus = z.infer<typeof marriageStatusSchema>;
export type CreateParentChildInput = z.infer<typeof createParentChildSchema>;
export type CreateMarriageInput = z.infer<typeof createMarriageSchema>;
export type UpdateParentChildInput = z.infer<typeof updateParentChildSchema>;
export type UpdateMarriageInput = z.infer<typeof updateMarriageSchema>;
export type UpdateRelationInput = z.infer<typeof updateRelationSchema>;
export type DeleteRelationInput = z.infer<typeof deleteRelationSchema>;
export type RelativeKind = z.infer<typeof relativeKindSchema>;
export type QuickAddRelativeInput = z.infer<typeof quickAddRelativeSchema>;
export type ListRelationsInput = z.infer<typeof listRelationsSchema>;
