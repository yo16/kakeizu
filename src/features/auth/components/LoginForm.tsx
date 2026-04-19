'use client';

import { useId, useState, useRef } from 'react';

import { Button, FormField, FormLabel, FormError, Input } from '@/components/ui';
import { signInWithPassword } from '@/features/auth/actions/sign-in';
import { signInSchema } from '@/features/auth/schemas';

import styles from './LoginForm.module.css';

interface FieldErrors {
  email?: string;
  password?: string;
  root?: string;
}

/**
 * ログインフォーム（Client Component）
 * zod でバリデーション、signInWithPassword Server Action で認証を行う。
 */
export function LoginForm() {
  const emailId = useId();
  const passwordId = useId();

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const input = {
      email: formData.get('email'),
      password: formData.get('password'),
    };

    // クライアントサイドバリデーション
    const parsed = signInSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const err of parsed.error.errors) {
        const field = err.path[0]?.toString() as keyof FieldErrors | undefined;
        if (field === 'email' || field === 'password') {
          fieldErrors[field] = err.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const result = await signInWithPassword(parsed.data);
      // ok: true の場合は Server Action 内で redirect されるため到達しない
      if (!result.ok) {
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
      // redirect() は例外を throw するため、ここには到達しない（正常系）
      // ただし network error などに備えて catch する
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
          ref={emailRef}
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
          ref={passwordRef}
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="8文字以上"
          error={errors.password}
          aria-describedby={errors.password ? `${passwordId}-error` : undefined}
        />
        {errors.password && <FormError message={errors.password} id={`${passwordId}-error`} />}
      </FormField>

      <Button type="submit" loading={isSubmitting} className={styles.submitButton}>
        ログイン
      </Button>
    </form>
  );
}
