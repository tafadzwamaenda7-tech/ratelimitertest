import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '../index.ts'
import { MockClock } from '../testing/mockClock.ts'

const LIMIT = 10

/**
 * Concurrency in Node.js is cooperative: a synchronous `consume()` cannot be
 * preempted mid-operation, so a single process needs no locks — the
 * read-modify-write per key is atomic by construction. These tests pin that
 * contract down: under the heaviest interleaving the runtime permits, a key is
 * still admitted exactly `LIMIT` times and no caller ever observes torn state.
 * Multi-process deployments protect the shared store instead (see DESIGN.md,
 * "Storage seam").
 */

describe('concurrent access', () => {
  it('admits exactly the limit when every caller lands on the same instant', () => {
    const clock = new MockClock()
    const limiter = createRateLimiter(
      { policy: 'sliding-window', limit: LIMIT, windowMs: 60_000 },
      clock,
    )

    // Frozen clock + synchronous storm: all 500 callers observe the same `now`.
    const results = Array.from({ length: 500 }, () => limiter.consume('hot-key'))

    const allowed = results.filter((result) => result.allowed)
    expect(allowed).toHaveLength(LIMIT)
    expect(results.at(-1)).toMatchObject({ allowed: false, remaining: 0, limit: LIMIT })
  })

  it('admits exactly the limit under an interleaved async storm', async () => {
    const clock = new MockClock()
    const limiter = createRateLimiter(
      { policy: 'sliding-window', limit: LIMIT, windowMs: 60_000 },
      clock,
    )

    const calls = Array.from({ length: 200 }, () => () => limiter.consume('hot-key'))

    // Schedule every caller as its own microtask before any of them runs, so
    // execution interleaves like 200 "simultaneous" requests arriving at once.
    const results = await Promise.all(calls.map((call) => Promise.resolve().then(call)))

    expect(results.filter((result) => result.allowed)).toHaveLength(LIMIT)
    expect(results.filter((result) => !result.allowed)).toHaveLength(calls.length - LIMIT)

    // No decision ever sees corrupted counters.
    for (const result of results) {
      expect(result.limit).toBe(LIMIT)
      expect(result.remaining).toBeGreaterThanOrEqual(0)
      expect(result.remaining).toBeLessThanOrEqual(LIMIT)
    }
  })

  it('recovers once the window slides, with no state leaked by the storm', () => {
    const clock = new MockClock()
    const limiter = createRateLimiter(
      { policy: 'sliding-window', limit: LIMIT, windowMs: 60_000 },
      clock,
    )

    Array.from({ length: 100 }, () => limiter.consume('hot-key'))
    expect(limiter.consume('hot-key').allowed).toBe(false)

    clock.advance(60_000) // exactly one full window

    // The storm is gone: a fresh request admits with the full budget minus one.
    const fresh = limiter.consume('hot-key')
    expect(fresh.allowed).toBe(true)
    expect(fresh.remaining).toBe(LIMIT - 1)

    // Only the single fresh request is live; nothing from the storm leaked.
    expect(limiter.trackedKeys()).toBe(1)
  })

  it('token bucket admits exactly its capacity under the same storm', () => {
    const clock = new MockClock()
    const limiter = createRateLimiter(
      { policy: 'token-bucket', capacity: LIMIT, refillPerSecond: 1 },
      clock,
    )

    const results = Array.from({ length: 500 }, () => limiter.consume('hot-key'))

    expect(results.filter((result) => result.allowed)).toHaveLength(LIMIT)
    expect(results.filter((result) => !result.allowed)).toHaveLength(500 - LIMIT)
  })
})