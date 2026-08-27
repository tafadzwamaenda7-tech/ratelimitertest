import { describe, expect, it } from 'vitest'
import { MockClock } from '../../src/core/testing/mockClock.ts'
import { buildLimiter, rateLimit } from '../rateLimit.ts'

describe('server rateLimit()', () => {
  it('admits up to the limit per key, then throttles with headers', () => {
    const clock = new MockClock()
    const limiter = buildLimiter({ policy: 'sliding-window', limit: 3, windowMs: 60_000, clock })

    const first = rateLimit(limiter, 'user-1')
    expect(first.allowed).toBe(true)
    expect(first.statusCode).toBe(200)
    expect(first.headers['x-ratelimit-limit']).toBe('3')
    expect(first.headers['x-ratelimit-remaining']).toBe('2')

    expect(rateLimit(limiter, 'user-1').allowed).toBe(true)
    expect(rateLimit(limiter, 'user-1').allowed).toBe(true)

    const fourth = rateLimit(limiter, 'user-1')
    expect(fourth.allowed).toBe(false)
    expect(fourth.statusCode).toBe(429)
    expect(fourth.headers['x-ratelimit-remaining']).toBe('0')
    expect(Number.parseInt(fourth.headers['retry-after'], 10)).toBeGreaterThanOrEqual(1)
    expect(fourth.body).toMatchObject({ ok: false, error: 'rate_limit_exceeded' })
  })

  it('keeps a rejected key from colliding with other keys', () => {
    const limiter = buildLimiter({ policy: 'sliding-window', limit: 2, windowMs: 60_000 })

    rateLimit(limiter, 'heavily-paged')
    rateLimit(limiter, 'heavily-paged')

    expect(rateLimit(limiter, 'quiet-client').allowed).toBe(true)
    expect(rateLimit(limiter, 'heavily-paged').allowed).toBe(false)
  })

  it('reports an exact reset window on a rejection', () => {
    const clock = new MockClock()
    const limiter = buildLimiter({ policy: 'sliding-window', limit: 2, windowMs: 60_000, clock })

    rateLimit(limiter, 'u')
    clock.set(10_000)
    rateLimit(limiter, 'u')
    clock.set(20_000)

    const rejected = rateLimit(limiter, 'u')
    expect(rejected.allowed).toBe(false)
    expect(rejected.body.resetAtMs).toBe(60_000)
    expect(rejected.headers['retry-after']).toBe('40')
    expect(rejected.body.retryAfterMs).toBe(40_000)
  })

  it('serves a token bucket behind the same interface', () => {
    const limiter = buildLimiter({ policy: 'token-bucket', capacity: 2, refillPerSecond: 1 })

    expect(rateLimit(limiter, 'u').allowed).toBe(true)
    expect(rateLimit(limiter, 'u').allowed).toBe(true)
    expect(rateLimit(limiter, 'u').allowed).toBe(false)
  })
})