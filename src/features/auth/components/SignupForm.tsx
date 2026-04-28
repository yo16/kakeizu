'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { z } from 'zod';

import { Button, FormField, FormLabel, FormError, Input } from '@/components/ui';
import { signUpWithPassword } from '@/features/auth/actions/sign-up';
import { signUpSchema } from '@/features/auth/schemas';

import { EmailVerificationNotice } from './EmailVerificationNotice';
import styles from './SignupForm.module.css';

// signUpSchema を拡張してパスワード確認フィールドと利用規約同意フィールドを追加
const signUpFormSchema = signUpSchema
  .extend({
    passwordConfirm: z.string(),
    agreeToTerms: z.literal(true, {
      errorMap: () => ({ message: '利用規約に同意してください' }),
    }),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'パスワードが一致しません',
    path: ['passwordConfirm'],
  });

interface FieldErrors {
  email?: string;
  password?: string;
  passwordConfirm?: string;
  agreeToTerms?: string;
  root?: string;
}

/**
 * サインアップフォーム（Client Component）
 * zod でバリデーション、signUpWithPassword Server Action でアカウント作成。
 * 成功時は EmailVerificationNotice に切り替える。
 */
export function SignupForm() {
  const emailId = useId();
  const passwordId = useId();
  const passwordConfirmId = useId();
  const agreeToTermsId = useId();

  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  if (verifiedEmail) {
    return <EmailVerificationNotice email={verifiedEmail} />;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const agreeToTermsValue = formData.get('agreeToTerms');
    const input = {
      email: (formData.get('email') as string) ?? '',
      password: (formData.get('password') as string) ?? '',
      passwordConfirm: (formData.get('passwordConfirm') as string) ?? '',
      // チェックされている場合は true、未チェックの場合は undefined になるため zod の literal(true) で検証
      agreeToTerms: agreeToTermsValue === 'on' ? (true as const) : undefined,
    };

    // クライアントサイドバリデーション（パスワード確認・利用規約同意含む）
    const parsed = signUpFormSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const err of parsed.error.errors) {
        const field = err.path[0]?.toString() as keyof FieldErrors | undefined;
        if (
          field === 'email' ||
          field === 'password' ||
          field === 'passwordConfirm' ||
          field === 'agreeToTerms'
        ) {
          fieldErrors[field] = err.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      // passwordConfirm を除いて Server Action に渡す
      const { email, password } = parsed.data;
      const result = await signUpWithPassword({ email, password });

      if (result.ok) {
        setVerifiedEmail(email);
      } else {
        const { error } = result;
        if (error.field === 'email') {
          setErrors({ email: error.message });
        } else if (error.field === 'password') {
          setErrors({ password: error.message });
        } else {
          setErrors({ root: error.message });
        }
      }
    } catch {
      // ネットワークエラー等への備え
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      {errors.root && (
        <div className={styles.rootError} role="alert">
          {errors.root}
        </div>
      )}

      <FormField>
        <FormLabel htmlFor={emailId} required>
          メールアドレス
        </FormLabel>
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="example@email.com"
          error={errors.email}
          aria-describedby={errors.email ? `${emailId}-error` : undefined}
        />
        {errors.email && <FormError message={errors.email} id={`${emailId}-error`} />}
      </FormField>

      <FormField>
        <FormLabel htmlFor={passwordId} required>
          パスワード
        </FormLabel>
        <Input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="8文字以上"
          error={errors.password}
          aria-describedby={errors.password ? `${passwordId}-error` : undefined}
        />
        {errors.password && <FormError message={errors.password} id={`${passwordId}-error`} />}
      </FormField>

      <FormField>
        <FormLabel htmlFor={passwordConfirmId} required>
          パスワード（確認）
        </FormLabel>
        <Input
          id={passwordConfirmId}
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          placeholder="パスワードを再入力"
          error={errors.passwordConfirm}
          aria-describedby={errors.passwordConfirm ? `${passwordConfirmId}-error` : undefined}
        />
        {errors.passwordConfirm && (
          <FormError message={errors.passwordConfirm} id={`${passwordConfirmId}-error`} />
        )}
      </FormField>

      <FormField>
        <div
          className={styles.agreement}
          aria-describedby={errors.agreeToTerms ? `${agreeToTermsId}-error` : undefined}
        >
          <input
            id={agreeToTermsId}
            name="agreeToTerms"
            type="checkbox"
            className={styles.checkbox}
            aria-required="true"
          />
          <label htmlFor={agreeToTermsId} className={styles.agreementLabel}>
            <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" className={styles.agreementLink}>
              利用規約
            </Link>
            {' および '}
            <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer" className={styles.agreementLink}>
              プライバシーポリシー
            </Link>
            {' に同意します'}
          </label>
        </div>
        {errors.agreeToTerms && (
          <FormError message={errors.agreeToTerms} id={`${agreeToTermsId}-error`} />
        )}
      </FormField>

      <Button type="submit" loading={isSubmitting} className={styles.submitButton}>
        アカウントを作成
      </Button>
    </form>
  );
}
