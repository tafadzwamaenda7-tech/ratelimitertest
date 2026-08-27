/**
 * Outcome of a single `consume` call. The two common contract shapes for
 * proxies and monitoring: how many requests are still allowed and when the
 * key frees a slot again.
 */
export interface RateLimitConsumption {
  allowed: boolean
  limit: number
  /** Slots available for another request right after this decision. */
  remaining: number
  /** Epoch ms at which the key is expected to free a slot. */
  resetAtMs: number
  /** Max(0, resetAtMs - now) in milliseconds. Meaningful only when rejected. */
  retryAfterMs: number
}

export interface RateLimiter {
  /** Convenience wrapper around consume(). */
  allow(key: string): boolean
  consume(key: string): RateLimitConsumption
  /** Number of keys currently retained. */
  trackedKeys(): number
  /** Drops keys without traffic in the last idleMs. Returns the count removed. */
  cleanupIdle(idleMs: number): number
}

export type RateLimiterConfig =
  | { policy: 'sliding-window'; limit: number; windowMs: number }
  | { policy: 'token-bucket'; capacity: number; refillPerSecond: number }

export type RateLimitPolicy = RateLimiterConfig['policy']