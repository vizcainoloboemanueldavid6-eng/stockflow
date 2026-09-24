/**
 * Typed application errors. Anything that extends AppError carries a message that
 * is safe to show to the user; createAction() turns it into `{ ok: false, error }`
 * and route handlers into a JSON response with `status`. Any other error is logged
 * and replaced by a generic message.
 */
export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'INSUFFICIENT_STOCK'
  | 'RATE_LIMITED';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, message: string, status: number) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do that.") {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested record no longer exists.') {
    super('NOT_FOUND', message, 404);
  }
}

export class ValidationError extends AppError {
  readonly fieldErrors?: Record<string, string[]>;

  constructor(
    message = 'Please check the highlighted fields.',
    fieldErrors?: Record<string, string[]>,
  ) {
    super('VALIDATION', message, 422);
    this.fieldErrors = fieldErrors;
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message?: string) {
    super(
      'RATE_LIMITED',
      message ?? `Too many attempts. Try again in ${formatWait(retryAfterSeconds)}.`,
      429,
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Raised by applyStockMovement() when a movement would take quantity below zero. */
export class InsufficientStockError extends AppError {
  readonly available: number;
  readonly requested: number;

  constructor(available: number, requested: number) {
    super(
      'INSUFFICIENT_STOCK',
      `Not enough stock: ${available} available, tried to remove ${requested}.`,
      409,
    );
    this.available = available;
    this.requested = requested;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function formatWait(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
