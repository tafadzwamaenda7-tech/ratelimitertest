import { createRateLimiter } from '../src/core/index.ts'
import type { Clock, RateLimiter } from '../src/core/index.ts'

export type ServerPolicy = 'sliding-window' | 'token-bucket'

export interface ServerOptions {
  policy?: ServerPolicy
  limit?: number
  windowMs?: number
  capacity?: number
  refillPerSecond?: number
  clock?: Clock
}

export interface RateLimitResponse {
  allowed: boolean
  statusCode: number
  headers: Record<string, string>
  body: Record<string, unknown>
}

/** Builds the limiter the server protects its endpoints with. */
export function buildLimiter(options: ServerOptions = {}): RateLimiter {
  if (options.policy === 'token-bucket') {
    return createRateLimiter(
      {
        policy: 'token-bucket',
        capacity: options.capacity ?? 5,
        refillPerSecond: options.refillPerSecond ?? 1,
      },
      options.clock,
    )
  }

  return createRateLimiter(
    {
      policy: 'sliding-window',
      limit: options.limit ?? 10,
      windowMs: options.windowMs ?? 60_000,
    },
    options.clock,
  )
}

/**
 * The whole HTTP contract of rate limiting in one function: decide, and return
 * what the server should emit. Everything below this line is a different JSON
 * renderer for the same decision.
 */
export function rateLimit(limiter: RateLimiter, key: string): RateLimitResponse {
  const consumed = limiter.consume(key)

  const headers: Record<string, string> = {
    'x-ratelimit-limit': String(consumed.limit),
    'x-ratelimit-remaining': String(consumed.remaining),
    'x-ratelimit-reset': String(Math.ceil(consumed.resetAtMs / 1000)),
  }

  if (consumed.allowed) {
    return { allowed: true, statusCode: 200, headers, body: { ok: true } }
  }

  const retryAfterSeconds = Math.max(1, Math.ceil(consumed.retryAfterMs / 1000))
  headers['retry-after'] = String(retryAfterSeconds)

  return {
    allowed: false,
    statusCode: 429,
    headers,
    body: {
      ok: false,
      error: 'rate_limit_exceeded',
      retryAfterMs: consumed.retryAfterMs,
      resetAtMs: consumed.resetAtMs,
    },
  }
}