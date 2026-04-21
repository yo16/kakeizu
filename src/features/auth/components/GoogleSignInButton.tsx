'use client';

import { Button } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast/ToastProvider';

import styles from './GoogleSignInButton.module.css';

/**
 * Google OAuth サインインボタン
 * Client Component で supabase.auth.signInWithOAuth を直接呼ぶ。
 */
export function GoogleSignInButton() {
  const toast = useToast();

  const handleClick = async () => {
    const supabase = createClient();
    const redirectTo = `${location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });

    if (error) {
      toast.error(error.message);
    }
  };

  const googleIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M15.68 8.18c0-.57-.05-1.11-.14-1.64H8v3.1h4.3a3.68 3.68 0 0 1-1.6 2.42v2h2.58c1.51-1.39 2.4-3.44 2.4-5.88z"
        fill="#4285F4"
      />
      <path
        d="M8 16c2.16 0 3.97-.72 5.3-1.94l-2.58-2a4.8 4.8 0 0 1-7.14-2.52H.96v2.06A8 8 0 0 0 8 16z"
        fill="#34A853"
      />
      <path
        d="M3.58 9.54A4.8 4.8 0 0 1 3.33 8c0-.54.09-1.06.25-1.54V4.4H.96A8 8 0 0 0 0 8c0 1.29.31 2.51.96 3.6l2.62-2.06z"
        fill="#FBBC05"
      />
      <path
        d="M8 3.2a4.33 4.33 0 0 1 3.07 1.2l2.3-2.3A7.7 7.7 0 0 0 8 0 8 8 0 0 0 .96 4.4l2.62 2.06A4.77 4.77 0 0 1 8 3.2z"
        fill="#EA4335"
      />
    </svg>
  );

  return (
    <Button
      variant="secondary"
      leftIcon={googleIcon}
      onClick={handleClick}
      className={styles.button}
    >
      Googleでサインイン
    </Button>
  );
}
