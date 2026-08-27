import type { Clock } from './clock.ts'
import { SystemClock } from './clock.ts'
import {
  assertCapacity,
  assertIdleMs,
  assertKey,
  assertRefillPerSecond,
} from './errors.ts'
import type { TokenStore } from './tokenStore.ts'
import { InMemoryTokenStore } from './tokenStore.ts'
import type { RateLimitConsumption, RateLimiter } from './types.ts'

export interface TokenBucketOptions {
  capacity: number
  refillPerSecond: number
}

/**
 * Token bucket. The bucket starts full, refills continuously, and each request
 * consumes one token. Bursts up to `capacity` are allowed, while sustained
 * throughput is capped by the refill rate. The right tool when short bursts
 * are legitimate and an exact per-window count is not required.
 */
export class TokenBucketLimiter implements RateLimiter {
  #capacity: number
  #refillPerMs: number
  #clock: Clock
  #store: TokenStore

  constructor(
    options: TokenBucketOptions,
    clock: Clock = new SystemClock(),
    store: TokenStore = new InMemoryTokenStore(),
  ) {
    assertCapacity(options.capacity)
    assertRefillPerSecond(options.refillPerSecond)
    this.#capacity = options.capacity
    this.#refillPerMs = options.refillPerSecond / 1000
    this.#clock = clock
    this.#store = store
  }

  allow(key: string): boolean {
    return this.consume(key).allowed
  }

  consume(key: string): RateLimitConsumption {
    assertKey(key)
    const now = this.#clock.now()
    const outcome = this.#store.consume(key, now, this.#capacity, this.#refillPerMs)

    const retryAfterMs = outcome.allowed
      ? 0
      : Math.ceil((1 - outcome.tokens) / this.#refillPerMs)

    return {
      allowed: outcome.allowed,
      limit: this.#capacity,
      remaining: outcome.remaining,
      resetAtMs: now + retryAfterMs,
      retryAfterMs,
    }
  }

  trackedKeys(): number {
    return this.#store.size()
  }

  cleanupIdle(idleMs: number): number {
    assertIdleMs(idleMs)
    const now = this.#clock.now()
    let removed = 0
    for (const key of this.#store.keys()) {
      const state = this.#store.get(key)
      if (state !== undefined && now - state.lastRefill > idleMs) {
        this.#store.delete(key)
        removed += 1
      }
    }
    return removed
  }
}