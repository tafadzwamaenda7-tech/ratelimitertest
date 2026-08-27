import { describe, expect, it } from 'vitest'
import { SlidingWindowLimiter } from '../slidingWindow.ts'
import { TokenBucketLimiter } from '../tokenBucket.ts'
import { MockClock } from '../testing/mockClock.ts'

/**
 * Deterministic PRNG (mulberry32) so the scenario is reproducible and fails
 * the same way every run. Letting the clock walk forward while clients fire
 * requests in bursts is closer to production traffic than hand-picked cases.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WINDOW_MS = 60_000
const LIMIT = 5
const KEYS = ['key-1', 'key-2', 'key-3', 'key-4', 'key-5']

describe('sliding window invariant under random traffic', () => {
  it('never admits more than the limit into any 60s window, for any traffic shape', () => {
    const random = mulberry32(20260827)
    const clock = new MockClock()
    const limiter = new SlidingWindowLimiter({ limit: LIMIT, windowMs: WINDOW_MS }, clock)

    // Oracle: the same admission rule applied off the limiter's own record,
    // so the test never just repeats the implementation's answer.
    const oracle = new Map<string, number[]>()
    let now = 0
    let admitted = 0
    let rejected = 0
    const steps = 5_000

    for (let step = 0; step < steps; step += 1) {
      now += Math.floor(random() * 1_400) // 0..~1.4s jumps
      clock.set(now)
      const key = KEYS[Math.floor(random() * KEYS.length)]

      const timeline = oracle.get(key) ?? []
      const cutoff = now - WINDOW_MS
      while (timeline.length > 0 && timeline[0] <= cutoff) {
        timeline.shift()
      }

      const result = limiter.consume(key)
      if (timeline.length >= LIMIT) {
        expect(result.allowed).toBe(false)
        rejected += 1
      } else {
        expect(result.allowed).toBe(true)
        timeline.push(now)
        oracle.set(key, timeline)
        admitted += 1
      }

      // The post-admission window can never exceed the limit.
      const count = timeline.filter((t) => t > now - WINDOW_MS).length
      expect(count).toBeLessThanOrEqual(LIMIT)
    }

    expect(admitted + rejected).toBe(steps)
    expect(admitted).toBeGreaterThan(0)
    expect(rejected).toBeGreaterThan(0)
  })

  it('is deterministic for a fixed seed and traffic pattern', () => {
    const run = (seed: number) => {
      const random = mulberry32(seed)
      const clock = new MockClock()
      const limiter = new SlidingWindowLimiter({ limit: LIMIT, windowMs: WINDOW_MS }, clock)
      const results: boolean[] = []
      let now = 0
      for (let i = 0; i < 2_000; i += 1) {
        now += Math.floor(random() * 800)
        clock.set(now)
        results.push(limiter.consume(KEYS[i % KEYS.length]).allowed)
      }
      return results
    }

    const first = run(7)
    const second = run(7)
    expect(first).toEqual(second)
    expect(first.filter(Boolean).length).toBeGreaterThan(0)
  })
})

describe('token bucket invariant under random traffic', () => {
  it('never mints more tokens than capacity plus the refill that elapsed', () => {
    const random = mulberry32(99)
    const clock = new MockClock()
    const limiter = new TokenBucketLimiter(
      { capacity: LIMIT, refillPerSecond: 0.5 },
      clock,
    )

    const admittedByKey = new Map<string, number>()
    const elapsedByKey = new Map<string, number>()
    const lastSeen = new Map<string, number>()
    let now = 0

    for (let i = 0; i < 5_000; i += 1) {
      now += Math.floor(random() * 1_000)
      clock.set(now)
      const key = KEYS[i % KEYS.length]

      // One key may carry over idle time between visits; add it to that key's
      // elapsed budget so the mint bound below stays exact.
      const sinceLast = now - (lastSeen.get(key) ?? now)
      elapsedByKey.set(key, (elapsedByKey.get(key) ?? 0) + sinceLast)
      lastSeen.set(key, now)

      const result = limiter.consume(key)
      expect(result.limit).toBe(LIMIT)
      expect(result.remaining).toBeGreaterThanOrEqual(0)

      if (result.allowed) {
        admittedByKey.set(key, (admittedByKey.get(key) ?? 0) + 1)
      }
    }

    // A bucket can never hand out more tokens than it started with plus the
    // refill accrued for its key over the observed time.
    for (const key of KEYS) {
      const admitted = admittedByKey.get(key) ?? 0
      const mintable = LIMIT + (elapsedByKey.get(key) ?? 0) * 0.5 / 1000
      expect(admitted).toBeLessThanOrEqual(mintable + 1e-9)
    }
  })
})