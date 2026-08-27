import { describe, expect, it } from 'vitest'
import { SlidingWindowLimiter } from '../slidingWindow.ts'
import { MockClock } from '../testing/mockClock.ts'

const WINDOW_MS = 60_000

function makeLimiter(options: { limit: number; windowMs?: number }, clock: MockClock) {
  return new SlidingWindowLimiter({ windowMs: WINDOW_MS, ...options }, clock)
}

describe('SlidingWindowLimiter', () => {
  describe('construction', () => {
    it('rejects invalid limits and windows', () => {
      const clock = new MockClock()
      expect(() => makeLimiter({ limit: -1 }, clock)).toThrow()
      expect(() => makeLimiter({ limit: 1.5 }, clock)).toThrow()
      expect(() => makeLimiter({ limit: 1, windowMs: 0 }, clock)).toThrow()
      expect(() => makeLimiter({ limit: 1, windowMs: -100 }, clock)).toThrow()
    })

    it('allows a zero limit that rejects everything without tracking keys', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ limit: 0 }, clock)
      for (let i = 0; i < 5; i += 1) {
        expect(limiter.allow('a')).toBe(false)
      }
      expect(limiter.trackedKeys()).toBe(0)
    })
  })

  describe('admission', () => {
    it('admits up to the limit and rejects beyond it', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ limit: 3 }, clock)
      expect(limiter.allow('a')).toBe(true)
      expect(limiter.allow('a')).toBe(true)
      expect(limiter.allow('a')).toBe(true)
      expect(limiter.allow('a')).toBe(false)
    })

    it('accounts rejected requests nowhere', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ limit: 1 }, clock)

      expect(limiter.allow('a')).toBe(true)
      expect(limiter.allow('a')).toBe(false)

      clock.set(WINDOW_MS)
      expect(limiter.allow('a')).toBe(true)
    })

    it('handles a same-millisecond burst', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ limit: 10 }, clock)
      const results = Array.from({ length: 25 }, () => limiter.allow('a'))
      expect(results.filter(Boolean)).toHaveLength(10)
    })
  })

  describe('boundaries', () => {
    it('rejects just before the window closes and admits at it', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ limit: 5 }, clock)

      for (let i = 0; i < 5; i += 1) {
        limiter.allow('a')
      }

      clock.set(WINDOW_MS - 1)
      expect(limiter.allow('a')).toBe(false)

      clock.set(WINDOW_MS)
      expect(limiter.allow('a')).toBe(true)
    })

    it('expires a request at exactly t + windowMs', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ limit: 1 }, clock)

      expect(limiter.allow('a')).toBe(true)
      clock.set(WINDOW_MS)
      expect(limiter.allow('a')).toBe(true)
      clock.set(WINDOW_MS)
      expect(limiter.allow('a')).toBe(false)
    })

    it('clears the window entirely after a long idle period', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ limit: 2 }, clock)

      limiter.allow('a')
      limiter.allow('a')
      expect(limiter.allow('a')).toBe(false)

      clock.advance(WINDOW_MS * 2)
      expect(limiter.allow('a')).toBe(true)
    })

    it('works with sub-second windows', () => {
      const clock = new MockClock()
      const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 1 }, clock)

      clock.set(5)
      expect(limiter.allow('a')).toBe(true)
      clock.set(5)
      expect(limiter.allow('a')).toBe(false)
      clock.set(6)
      expect(limiter.allow('a')).toBe(true)
    })
  })

  describe('consume() result', () => {
    it('reports remaining slots when allowed', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ limit: 5 }, clock)

      const first = limiter.consume('a')
      expect(first).toMatchObject({ allowed: true, limit: 5, remaining: 4, retryAfterMs: 0 })

      limiter.consume('a')
      limiter.consume('a')
      limiter.consume('a')
      const last = limiter.consume('a')
      expect(last).toMatchObject({ allowed: true, remaining: 0, resetAtMs: 0 })
    })

    it('sets a reset time aligned with the oldest surviving request', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ limit: 2 }, clock)

      limiter.consume('a') // oldest = 0 -> resets at 60_000
      clock.set(10_000)
      limiter.consume('a')
      clock.set(20_000)
      const rejected = limiter.consume('a')
      expect(rejected).toMatchObject({ allowed: false, remaining: 0 })
      expect(rejected.retryAfterMs).toBe(WINDOW_MS - 20_000)
      expect(rejected.resetAtMs).toBe(WINDOW_MS)
    })
  })

  describe('historyOf', () => {
    it('returns the live log without exposing the internal array', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ limit: 5 }, clock)

      limiter.allow('a')
      limiter.allow('a')

      const peek = limiter.historyOf('a')
      expect(peek).toEqual([0, 0])
      peek.push(999)
      expect(limiter.historyOf('a')).toEqual([0, 0])
    })

    it('excludes requests that have slid out of the window', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ limit: 5 }, clock)

      limiter.allow('a')
      limiter.allow('a')

      clock.set(WINDOW_MS - 1)
      limiter.allow('a')

      clock.set(WINDOW_MS)
      expect(limiter.historyOf('a')).toEqual([WINDOW_MS - 1])
    })
  })

  describe('key validation', () => {
    it('rejects empty or whitespace-only keys', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ limit: 5 }, clock)
      expect(() => limiter.allow('')).toThrow(TypeError)
      expect(() => limiter.consume('   ')).toThrow(TypeError)
      expect(() => limiter.historyOf('')).toThrow(TypeError)
    })
  })

  describe('key isolation and cleanup', () => {
    it('keeps budgets independent per key', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ limit: 1 }, clock)

      expect(limiter.allow('a')).toBe(true)
      expect(limiter.allow('a')).toBe(false)
      expect(limiter.allow('b')).toBe(true)
      expect(limiter.trackedKeys()).toBe(2)
    })

    it('cleanupIdle removes only idle keys', () => {
      const clock = new MockClock()
      const limiter = makeLimiter({ limit: 1 }, clock)

      limiter.allow('idle-client')
      limiter.allow('active-client')

      clock.set(WINDOW_MS * 2)
      limiter.allow('active-client')

      expect(limiter.cleanupIdle(WINDOW_MS)).toBe(1)
      expect(limiter.trackedKeys()).toBe(1)
      expect(() => limiter.cleanupIdle(-1)).toThrow(TypeError)
    })
  })

  describe('default clock', () => {
    it('works without an injected clock', () => {
      const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 1_000 })
      const result = limiter.consume('a')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(0)
    })
  })
})