'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

import { Button, FormField, FormLabel, FormError, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

import styles from './ResetPasswordForm.module.css';

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, { message: 'パスワードは8文字以上で入力してください' }),
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'パスワードが一致しません',
    path: ['passwordConfirm'],
  });

interface FieldErrors {
  password?: string;
  passwordConfirm?: string;
  root?: string;
}

/**
 * 新パスワード設定フォーム（Client Component）
 * supabase.auth.updateUser でパスワードを更新する。
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const passwordId = useId();
  const passwordConfirmId = useId();

  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const input = {
      password: formData.get('password'),
      passwordConfirm: formData.get('passwordConfirm'),
    };

    // クライアントサイドバリデーション
    const parsed = resetPasswordSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const err of parsed.error.errors) {
        const field = err.path[0]?.toString() as keyof FieldErrors | undefined;
        if (field === 'password' || field === 'passwordConfirm') {
          fieldErrors[field] = err.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

      if (error) {
        console.error('[ResetPasswordForm] updateUser error:', error.message);
        setErrors({ root: 'パスワードの更新に失敗しました。リセット用リンクの有効期限が切れている可能性があります。' });
        return;
      }

      router.push('/login?reset=success');
    } catch {
      setErrors({ root: '予期しないエラーが発生しました。しばらくしてからもう一度お試しください。' });
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
        <FormLabel htmlFor={passwordId} required>
          新しいパスワード
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
          新しいパスワード（確認）
        </FormLabel>
        <Input
          id={passwordConfirmId}
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          placeholder="もう一度入力してください"
          error={errors.passwordConfirm}
          aria-describedby={errors.passwordConfirm ? `${passwordConfirmId}-error` : undefined}
        />
        {errors.passwordConfirm && (
          <FormError message={errors.passwordConfirm} id={`${passwordConfirmId}-error`} />
        )}
      </FormField>

      <Button type="submit" loading={isSubmitting} className={styles.submitButton}>
        パスワードを更新する
      </Button>
    </form>
  );
}
