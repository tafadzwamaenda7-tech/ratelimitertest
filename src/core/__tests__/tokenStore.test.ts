import { describe, expect, it } from 'vitest'
import { InMemoryTokenStore } from '../tokenStore.ts'

const RATE_PER_MS = 0.001 // 1 token per second

describe('InMemoryTokenStore', () => {
  it('starts a key effectively full, capped at capacity', () => {
    const store = new InMemoryTokenStore()
    const burst = Array.from({ length: 5 }, () => store.consume('a', 0, 5, RATE_PER_MS))
    expect(burst.every((outcome) => outcome.allowed)).toBe(true)
    expect(store.consume('a', 0, 5, RATE_PER_MS).allowed).toBe(false)
  })

  it('refills over time and accumulates fractional tokens', () => {
    const store = new InMemoryTokenStore()
    store.consume('a', 0, 1, RATE_PER_MS)

    // 500ms at 1/s -> 0.5 tokens: not enough for a full token.
    expect(store.consume('a', 500, 1, RATE_PER_MS).allowed).toBe(false)

    // Another 500ms -> 1.0 token, consumed.
    const outcome = store.consume('a', 1_000, 1, RATE_PER_MS)
    expect(outcome.allowed).toBe(true)
    expect(outcome.remaining).toBe(0)
  })

  it('never holds more than capacity no matter how long it idles', () => {
    const store = new InMemoryTokenStore()
    store.consume('a', 0, 3, RATE_PER_MS)
    store.consume('a', 0, 3, RATE_PER_MS)
    store.consume('a', 0, 3, RATE_PER_MS)

    store.consume('a', 60_000, 3, RATE_PER_MS)
    store.consume('a', 60_000, 3, RATE_PER_MS)
    store.consume('a', 60_000, 3, RATE_PER_MS)
    expect(store.consume('a', 60_000, 3, RATE_PER_MS).allowed).toBe(false)
  })

  it('keeps per-key state independent', () => {
    const store = new InMemoryTokenStore()
    store.consume('a', 0, 1, RATE_PER_MS)
    expect(store.consume('a', 0, 1, RATE_PER_MS).allowed).toBe(false)
    expect(store.consume('b', 0, 1, RATE_PER_MS).allowed).toBe(true)
    expect(store.size()).toBe(2)
  })
})