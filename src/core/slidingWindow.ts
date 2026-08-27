import type { Clock } from './clock.ts'
import { SystemClock } from './clock.ts'
import {
  assertIdleMs,
  assertKey,
  assertLimit,
  assertWindowMs,
} from './errors.ts'
import type { RateLimitConsumption, RateLimiter } from './types.ts'
import type { WindowStore } from './windowStore.ts'
import { InMemoryWindowStore } from './windowStore.ts'

export interface SlidingWindowOptions {
  limit: number
  windowMs: number
}

/**
 * Sliding window log. Every admitted request stores its arrival timestamp; a
 * new request is admitted only when fewer than `limit` timestamps fall inside
 * `(now - windowMs, now]`. Exact by construction â€” a request lives in
 * `[t, t + windowMs)` and stops counting at exactly `t + windowMs`. Rejected
 * requests are never recorded, so they cannot extend the window.
 */
export class SlidingWindowLimiter implements RateLimiter {
  #limit: number
  #windowMs: number
  #clock: Clock
  #store: WindowStore

  constructor(
    options: SlidingWindowOptions,
    clock: Clock = new SystemClock(),
    store: WindowStore = new InMemoryWindowStore(),
  ) {
    assertLimit(options.limit)
    assertWindowMs(options.windowMs)
    this.#limit = options.limit
    this.#windowMs = options.windowMs
    this.#clock = clock
    this.#store = store
  }

  allow(key: string): boolean {
    return this.consume(key).allowed
  }

  consume(key: string): RateLimitConsumption {
    assertKey(key)
    const now = this.#clock.now()
    const outcome = this.#store.admit(key, now, now - this.#windowMs, this.#limit)

    const retryAfterMs = outcome.allowed
      ? 0
      : Math.max(0, (outcome.oldest ?? now) + this.#windowMs - now)

    return {
      allowed: outcome.allowed,
      limit: this.#limit,
      remaining: outcome.remaining,
      resetAtMs: now + retryAfterMs,
      retryAfterMs,
    }
  }

  /** Live request log for a key (ascending). Inspection and dashboards only. */
  historyOf(key: string): number[] {
    assertKey(key)
    const cutoff = this.#clock.now() - this.#windowMs
    return this.#store.get(key).filter((timestamp) => timestamp > cutoff)
  }

  trackedKeys(): number {
    return this.#store.size()
  }

  cleanupIdle(idleMs: number): number {
    assertIdleMs(idleMs)
    const now = this.#clock.now()
    let removed = 0
    for (const key of this.#store.keys()) {
      const history = this.#store.get(key)
      if (history.length === 0 || now - history[history.length - 1] > idleMs) {
        this.#store.delete(key)
        removed += 1
      }
    }
    return removed
  }
}