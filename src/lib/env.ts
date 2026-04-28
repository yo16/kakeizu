/**
 * 環境変数の zod 検証
 *
 * このファイルは `serverEnv` (Stripe シークレットキー等) を export するためサーバー専用。
 * Client Component から誤って import するとビルドエラーになる。
 *
 * 将来 Client Component から `clientEnv` を参照する必要が生じた場合は、
 * `env/server.ts` と `env/client.ts` への分割を検討する。
 */
import 'server-only';
import { z } from 'zod';

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // 後続 Epic で使う予定 (現時点では optional)
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_BASIC_JPY_MONTHLY: z.string().optional(),
  STRIPE_PRICE_STANDARD_JPY_MONTHLY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

export const serverEnv = serverEnvSchema.parse(process.env);

export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
