export interface TokenState {
  tokens: number
  lastRefill: number
}

export interface ConsumeOutcome {
  allowed: boolean
  remaining: number
  /** Tokens left after the decision, before flooring. */
  tokens: number
}

/**
 * Storage for token buckets. `consume` refills and, when possible, deducts a
 * token as one atomic operation per key; a distributed backend would run the
 * same sequence in a Lua script.
 */
export interface TokenStore {
  consume(key: string, at: number, capacity: number, refillPerMs: number): ConsumeOutcome
  get(key: string): TokenState | undefined
  delete(key: string): void
  keys(): Iterable<string>
  size(): number
}

export class InMemoryTokenStore implements TokenStore {
  #buckets = new Map<string, TokenState>()

  consume(key: string, at: number, capacity: number, refillPerMs: number): ConsumeOutcome {
    const state = this.#buckets.get(key)
    const lastRefill = state?.lastRefill ?? at
    const accumulated = (state?.tokens ?? capacity) + (at - lastRefill) * refillPerMs
    const available = Math.min(capacity, accumulated)

    if (available >= 1) {
      this.#buckets.set(key, { tokens: available - 1, lastRefill: at })
      return { allowed: true, remaining: Math.floor(available - 1), tokens: available - 1 }
    }

    this.#buckets.set(key, { tokens: available, lastRefill: at })
    return { allowed: false, remaining: 0, tokens: available }
  }

  get(key: string): TokenState | undefined {
    return this.#buckets.get(key)
  }

  delete(key: string): void {
    this.#buckets.delete(key)
  }

  keys(): Iterable<string> {
    return this.#buckets.keys()
  }

  size(): number {
    return this.#buckets.size
  }
}