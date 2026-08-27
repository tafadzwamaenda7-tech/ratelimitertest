import { describe, expect, it } from 'vitest'
import { TokenBucketLimiter } from '../tokenBucket.ts'
import { MockClock } from '../testing/mockClock.ts'

function makeLimiter(options: { capacity: number; refillPerSecond: number }, clock: MockClock) {
  return new TokenBucketLimiter(options, clock)
}

describe('TokenBucketLimiter', () => {
  describe('construction', () => {
    it('rejects invalid capacity and refill rates', () => {
      const clock = new MockClock()
      expect(() => makeLimiter({ capacity: 0, refillPerSecond: 1 }, clock)).toThrow()
      expect(() => makeLimiter({ capacity: -5, refillPerSecond: 1 }, clock)).toThrow()
      expect(() => makeLimiter({ capacity: 2.5, refillPerSecond: 1 }, clock)).toThrow()
      expect(() => makeLimiter({ capacity: 5, refillPerSecond: 0 }, clock)).toThrow()
      expect(() => makeLimiter({ capacity: 5, refillPerSecond: -1 }, clock)).toThrow()
    })
  })

  describe('admission', () => {
    it('admits a full burst up to capacity, then rejects', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ capacity: 5, refillPerSecond: 2 }, clock)

      for (let i = 0; i < 5; i += 1) {
        expect(limiter.allow('a')).toBe(true)
      }
      expect(limiter.allow('a')).toBe(false)
    })

    it('refills over time, in whole and fractional steps', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ capacity: 5, refillPerSecond: 2 }, clock)

      for (let i = 0; i < 5; i += 1) {
        limiter.allow('a')
      }
      expect(limiter.allow('a')).toBe(false)

      // 2 tokens/s -> one token per 500ms.
      clock.advance(500)
      expect(limiter.allow('a')).toBe(true)
      expect(limiter.allow('a')).toBe(false)

      clock.advance(250)
      expect(limiter.allow('a')).toBe(false)

      clock.advance(250)
      expect(limiter.allow('a')).toBe(true)
    })

    it('caps tokens at capacity after a long idle', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ capacity: 3, refillPerSecond: 100 }, clock)

      for (let i = 0; i < 3; i += 1) {
        limiter.allow('a')
      }
      expect(limiter.allow('a')).toBe(false)

      clock.advance(60_000)
      for (let i = 0; i < 3; i += 1) {
        expect(limiter.allow('a')).toBe(true)
      }
      expect(limiter.allow('a')).toBe(false)
    })
  })

  describe('consume() result', () => {
    it('reports remaining tokens when allowed, and retry delay when rejected', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ capacity: 1, refillPerSecond: 1 }, clock)

      const first = limiter.consume('a')
      expect(first).toMatchObject({ allowed: true, limit: 1, remaining: 0, retryAfterMs: 0 })

      const rejected = limiter.consume('a')
      expect(rejected).toMatchObject({ allowed: false, remaining: 0 })
      // One full second until the next token.
      expect(rejected.retryAfterMs).toBe(1_000)
      expect(rejected.resetAtMs).toBe(1_000)
    })
  })

  describe('key isolation and cleanup', () => {
    it('keeps per-key buckets independent', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ capacity: 1, refillPerSecond: 0.1 }, clock)

      expect(limiter.allow('a')).toBe(true)
      expect(limiter.allow('a')).toBe(false)
      expect(limiter.allow('b')).toBe(true)
      expect(limiter.trackedKeys()).toBe(2)
    })

    it('cleanupIdle drops idle buckets', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ capacity: 1, refillPerSecond: 1 }, clock)

      limiter.allow('old')
      clock.advance(10_000)
      limiter.allow('fresh')

      expect(limiter.cleanupIdle(5_000)).toBe(1)
      expect(limiter.trackedKeys()).toBe(1)
    })
  })

  describe('key validation', () => {
    it('rejects empty keys', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ capacity: 1, refillPerSecond: 1 }, clock)
      expect(() => limiter.allow('')).toThrow(TypeError)
    })
  })
})