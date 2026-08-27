import { describe, expect, it } from 'vitest'
import { InMemoryWindowStore } from '../windowStore.ts'

const WINDOW = 60_000

function admit(store: InMemoryWindowStore, key: string, now: number, limit: number) {
  return store.admit(key, now, now - WINDOW, limit)
}

describe('InMemoryWindowStore', () => {
  it('admits the first request of a key', () => {
    const store = new InMemoryWindowStore()
    const outcome = admit(store, 'a', 0, 3)
    expect(outcome).toMatchObject({ allowed: true, remaining: 2, oldest: 0 })
    expect(store.get('a')).toEqual([0])
  })

  it('stops admitting at the limit and reports oldest', () => {
    const store = new InMemoryWindowStore()
    admit(store, 'a', 0, 3)
    admit(store, 'a', 1, 3)
    admit(store, 'a', 2, 3)
    const rejected = admit(store, 'a', 5, 3)
    expect(rejected).toMatchObject({ allowed: false, remaining: 0, oldest: 0 })
  })

  it('drops expired timestamps before judging', () => {
    const store = new InMemoryWindowStore()
    admit(store, 'a', 0, 2)
    admit(store, 'a', 1, 2)

    // A request at exactly t + windowMs no longer counts (t <= cutoff).
    admit(store, 'a', WINDOW, 2)
    expect(store.get('a')).toEqual([1, WINDOW])

    // The entry at t=1 expires at exactly t + windowMs and stops counting.
    const outcome = admit(store, 'a', WINDOW + 1, 2)
    expect(outcome).toMatchObject({ allowed: true, remaining: 0, oldest: WINDOW })
    expect(store.get('a')).toEqual([WINDOW, WINDOW + 1])
  })

  it('removes a key that is rejected on an empty log', () => {
    const store = new InMemoryWindowStore()
    const outcome = admit(store, 'zero', 0, 0)
    expect(outcome.allowed).toBe(false)
    expect(store.get('zero').length).toBe(0)
    expect(store.size()).toBe(0)
  })

  it('tracks keys and supports deletion', () => {
    const store = new InMemoryWindowStore()
    admit(store, 'x', 0, 5)
    admit(store, 'y', 0, 5)
    expect(store.size()).toBe(2)
    expect([...store.keys()].sort()).toEqual(['x', 'y'])

    store.delete('x')
    expect(store.size()).toBe(1)
    expect(store.get('x').length).toBe(0)
  })
})