/**
 * Person ドメイン zod スキーマ定義
 *
 * Server Actions とクライアントフォームで共通利用する。
 * api-design.md §3 Person セクションの仕様に準拠。
 * db-design.md §2.6 person テーブルの制約に準拠。
 */
import { z } from 'zod';

/** 曖昧日付フィールド（year/month/day 個別 nullable） */
const partialDateSchema = z.object({
  year: z
    .number({ invalid_type_error: '年は数値で入力してください' })
    .int()
    .min(1000, { message: '年は1000以上で入力してください' })
    .max(9999, { message: '年は9999以下で入力してください' })
    .nullable()
    .optional(),
  month: z
    .number({ invalid_type_error: '月は数値で入力してください' })
    .int()
    .min(1, { message: '月は1〜12で入力してください' })
    .max(12, { message: '月は1〜12で入力してください' })
    .nullable()
    .optional(),
  day: z
    .number({ invalid_type_error: '日は数値で入力してください' })
    .int()
    .min(1, { message: '日は1〜31で入力してください' })
    .max(31, { message: '日は1〜31で入力してください' })
    .nullable()
    .optional(),
});

/** gender の許容値 */
const genderSchema = z
  .enum(['male', 'female', 'other', 'unknown'], {
    invalid_type_error: '性別は male/female/other/unknown で指定してください',
  })
  .nullable()
  .optional();

/** createPerson Server Action 入力スキーマ */
export const createPersonSchema = z.object({
  treeId: z.string().uuid({ message: '有効なツリーIDを指定してください' }),
  displayName: z
    .string({ required_error: '名前を入力してください' })
    .min(1, { message: '名前を入力してください' })
    .max(200, { message: '名前は200文字以内で入力してください' }),
  familyName: z
    .string()
    .max(100, { message: '姓は100文字以内で入力してください' })
    .nullable()
    .optional(),
  givenName: z
    .string()
    .max(100, { message: '名は100文字以内で入力してください' })
    .nullable()
    .optional(),
  maidenName: z
    .string()
    .max(100, { message: '旧姓は100文字以内で入力してください' })
    .nullable()
    .optional(),
  gender: genderSchema,
  birth: partialDateSchema.optional(),
  birthPlace: z
    .string()
    .max(200, { message: '出生地は200文字以内で入力してください' })
    .nullable()
    .optional(),
  death: partialDateSchema.optional(),
  deathPlace: z
    .string()
    .max(200, { message: '死亡地は200文字以内で入力してください' })
    .nullable()
    .optional(),
  isAlive: z.boolean().optional(),
  note: z
    .string()
    .max(5000, { message: 'メモは5000文字以内で入力してください' })
    .nullable()
    .optional(),
});

/** updatePerson Server Action 入力スキーマ */
export const updatePersonSchema = z
  .object({
    personId: z.string().uuid({ message: '有効な人物IDを指定してください' }),
    displayName: z
      .string()
      .min(1, { message: '名前を入力してください' })
      .max(200, { message: '名前は200文字以内で入力してください' })
      .optional(),
    familyName: z
      .string()
      .max(100, { message: '姓は100文字以内で入力してください' })
      .nullable()
      .optional(),
    givenName: z
      .string()
      .max(100, { message: '名は100文字以内で入力してください' })
      .nullable()
      .optional(),
    maidenName: z
      .string()
      .max(100, { message: '旧姓は100文字以内で入力してください' })
      .nullable()
      .optional(),
    gender: genderSchema,
    birth: partialDateSchema.optional(),
    birthPlace: z
      .string()
      .max(200, { message: '出生地は200文字以内で入力してください' })
      .nullable()
      .optional(),
    death: partialDateSchema.optional(),
    deathPlace: z
      .string()
      .max(200, { message: '死亡地は200文字以内で入力してください' })
      .nullable()
      .optional(),
    isAlive: z.boolean().optional(),
    note: z
      .string()
      .max(5000, { message: 'メモは5000文字以内で入力してください' })
      .nullable()
      .optional(),
  })
  .refine(
    (data) => {
      // 最低1フィールドは指定が必要 (personId 以外)
      const { personId: _, ...rest } = data;
      void _;
      return Object.values(rest).some((v) => v !== undefined);
    },
    { message: '更新するフィールドを少なくとも1つ指定してください' }
  );

/** deletePerson Server Action 入力スキーマ */
export const deletePersonSchema = z.object({
  personId: z.string().uuid({ message: '有効な人物IDを指定してください' }),
});

/** setPrimaryPhoto Server Action 入力スキーマ */
export const setPrimaryPhotoSchema = z.object({
  personId: z.string().uuid({ message: '有効な人物IDを指定してください' }),
  photoId: z.string().uuid({ message: '有効な写真IDを指定してください' }),
});

/** getPerson Server Action 入力スキーマ */
export const getPersonSchema = z.object({
  personId: z.string().uuid({ message: '有効な人物IDを指定してください' }),
});

/** listPersons Server Action 入力スキーマ */
export const listPersonsSchema = z.object({
  treeId: z.string().uuid({ message: '有効なツリーIDを指定してください' }),
});

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;
export type DeletePersonInput = z.infer<typeof deletePersonSchema>;
export type SetPrimaryPhotoInput = z.infer<typeof setPrimaryPhotoSchema>;
export type GetPersonInput = z.infer<typeof getPersonSchema>;
export type ListPersonsInput = z.infer<typeof listPersonsSchema>;
