import type { Clock } from './clock.ts'
import { SystemClock } from './clock.ts'
import { SlidingWindowLimiter } from './slidingWindow.ts'
import { TokenBucketLimiter } from './tokenBucket.ts'
import type { RateLimiter, RateLimiterConfig } from './types.ts'

/** Builds a limiter for the given policy. The clock defaults to wall time. */
export function createRateLimiter(
  config: RateLimiterConfig,
  clock: Clock = new SystemClock(),
): RateLimiter {
  switch (config.policy) {
    case 'sliding-window':
      return new SlidingWindowLimiter({ limit: config.limit, windowMs: config.windowMs }, clock)
    case 'token-bucket':
      return new TokenBucketLimiter(
        { capacity: config.capacity, refillPerSecond: config.refillPerSecond },
        clock,
      )
  }
}