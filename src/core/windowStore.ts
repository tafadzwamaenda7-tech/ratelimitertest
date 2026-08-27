export interface AdmitOutcome {
  allowed: boolean
  remaining: number
  /** Oldest timestamp still inside the window, used to derive the reset time. */
  oldest: number | undefined
}

/**
 * Storage for a sliding window log. `admit` performs the whole
 * trim-and-check-and-record sequence as one atomic operation for the key, so a
 * distributed implementation maps to a single Lua script and keeps the same
 * guarantees across processes.
 */
export interface WindowStore {
  admit(key: string, now: number, cutoff: number, limit: number): AdmitOutcome
  /** Live log for a key, ascending; treat as read-only. */
  get(key: string): readonly number[]
  delete(key: string): void
  keys(): Iterable<string>
  size(): number
}

export class InMemoryWindowStore implements WindowStore {
  #log = new Map<string, number[]>()

  admit(key: string, now: number, cutoff: number, limit: number): AdmitOutcome {
    let history = this.#log.get(key)
    if (history === undefined) {
      history = []
      this.#log.set(key, history)
    }

    let dropped = 0
    while (dropped < history.length && history[dropped] <= cutoff) {
      dropped += 1
    }
    if (dropped > 0) {
      history.splice(0, dropped)
    }

    if (history.length >= limit) {
      if (history.length === 0) {
        this.#log.delete(key)
      }
      return { allowed: false, remaining: 0, oldest: history[0] }
    }

    history.push(now)
    return {
      allowed: true,
      remaining: limit - history.length,
      oldest: history[0],
    }
  }

  get(key: string): readonly number[] {
    return this.#log.get(key) ?? []
  }

  delete(key: string): void {
    this.#log.delete(key)
  }

  keys(): Iterable<string> {
    return this.#log.keys()
  }

  size(): number {
    return this.#log.size
  }
}