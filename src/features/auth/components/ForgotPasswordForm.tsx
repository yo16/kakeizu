'use client';

import { useId, useState } from 'react';

import { Button, FormField, FormLabel, FormError, Input } from '@/components/ui';
import { requestPasswordReset } from '@/features/auth/actions/request-password-reset';
import { requestPasswordResetSchema } from '@/features/auth/schemas';

import styles from './ForgotPasswordForm.module.css';

interface FieldErrors {
  email?: string;
  root?: string;
}

/**
 * パスワードリセット申請フォーム（Client Component）
 * zod でバリデーション、requestPasswordReset Server Action でメール送信を行う。
 */
export function ForgotPasswordForm() {
  const emailId = useId();

  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const input = {
      email: formData.get('email'),
    };

    // クライアントサイドバリデーション
    const parsed = requestPasswordResetSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const err of parsed.error.errors) {
        const field = err.path[0]?.toString() as keyof FieldErrors | undefined;
        if (field === 'email') {
          fieldErrors[field] = err.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const result = await requestPasswordReset(parsed.data);
      if (result.ok) {
        setSuccessEmail(parsed.data.email);
      } else {
        setErrors({ root: result.error.message });
      }
    } catch {
      setErrors({ root: '予期しないエラーが発生しました。しばらくしてからもう一度お試しください。' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successEmail) {
    return (
      <div className={styles.successMessage} role="alert">
        <p>{successEmail} 宛にリセット用リンクを送信しました。メールをご確認ください。</p>
      </div>
    );
  }

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

      <Button type="submit" loading={isSubmitting} className={styles.submitButton}>
        リセット用メールを送信
      </Button>
    </form>
  );
}
