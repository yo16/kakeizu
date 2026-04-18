/**
 * Auth ドメイン zod スキーマ定義
 *
 * Server Actions とクライアントフォームで共通利用する。
 */
import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().email({ message: '有効なメールアドレスを入力してください' }),
  password: z
    .string()
    .min(8, { message: 'パスワードは8文字以上で入力してください' }),
});

export const signUpSchema = z.object({
  email: z.string().email({ message: '有効なメールアドレスを入力してください' }),
  password: z
    .string()
    .min(8, { message: 'パスワードは8文字以上で入力してください' }),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().email({ message: '有効なメールアドレスを入力してください' }),
});

export const deleteAccountSchema = z.object({
  confirmEmail: z.string().email({ message: '有効なメールアドレスを入力してください' }),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
