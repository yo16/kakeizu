/**
 * Server Action の共通戻り値型
 *
 * api-design.md §2 の ActionResult 定義に準拠。
 */

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'PLAN_LIMIT_EXCEEDED'
  | 'SHARE_TOKEN_INVALID'
  | 'RELATION_CONFLICT'
  | 'STRIPE_ERROR'
  | 'INTERNAL_ERROR';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; field?: string } };
