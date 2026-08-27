export class RateLimiterConfigError extends TypeError {
  constructor(message: string) {
    super(message)
    this.name = 'RateLimiterConfigError'
  }
}

export function assertLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new RateLimiterConfigError(`limit must be a non-negative integer, got ${limit}`)
  }
}

export function assertWindowMs(windowMs: number): void {
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new RateLimiterConfigError(`windowMs must be a positive integer of milliseconds, got ${windowMs}`)
  }
}

export function assertCapacity(capacity: number): void {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RateLimiterConfigError(`capacity must be a positive integer, got ${capacity}`)
  }
}

export function assertRefillPerSecond(refillPerSecond: number): void {
  if (!Number.isFinite(refillPerSecond) || refillPerSecond <= 0) {
    throw new RateLimiterConfigError(
      `refillPerSecond must be a positive number, got ${refillPerSecond}`,
    )
  }
}

export function assertIdleMs(idleMs: number): void {
  if (!Number.isFinite(idleMs) || idleMs < 0) {
    throw new RateLimiterConfigError(`idleMs must be a non-negative number, got ${idleMs}`)
  }
}

export function assertKey(key: string): void {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new TypeError('a rate limiter key must be a non-empty string')
  }
}