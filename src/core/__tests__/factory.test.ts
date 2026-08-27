import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '../factory.ts'
import { SlidingWindowLimiter } from '../slidingWindow.ts'
import { TokenBucketLimiter } from '../tokenBucket.ts'
import { MockClock } from '../testing/mockClock.ts'

const WINDOW_MS = 60_000

describe('createRateLimiter', () => {
  it('builds a sliding window limiter for the sliding-window policy', () => {
    const clock = new MockClock()
    const limiter = createRateLimiter({ policy: 'sliding-window', limit: 2, windowMs: 1_000 }, clock)
    expect(limiter).toBeInstanceOf(SlidingWindowLimiter)
    expect(limiter.allow('a')).toBe(true)
  })

  it('builds a token bucket limiter for the token-bucket policy', () => {
    const clock = new MockClock()
    const limiter = createRateLimiter({ policy: 'token-bucket', capacity: 2, refillPerSecond: 1 }, clock)
    expect(limiter).toBeInstanceOf(TokenBucketLimiter)
    expect(limiter.allow('a')).toBe(true)
  })

  it('plugs the injected clock into either policy', () => {
    const clock = new MockClock()
    const limiter = createRateLimiter({ policy: 'sliding-window', limit: 1, windowMs: 60_000 }, clock)

    limiter.consume('a') // admitted at now = 0, resets at 60_000
    clock.set(41_000)
    const rejected = limiter.consume('a')
    expect(rejected.retryAfterMs).toBe(WINDOW_MS - 41_000)
    expect(rejected.resetAtMs).toBe(WINDOW_MS)
  })

  it('stores invalid configuration as a config error', () => {
    expect(() =>
      createRateLimiter({ policy: 'sliding-window', limit: -1, windowMs: 1_000 }),
    ).toThrow(TypeError)
    expect(() =>
      createRateLimiter({ policy: 'token-bucket', capacity: 0, refillPerSecond: 1 }),
    ).toThrow(TypeError)
  })
})