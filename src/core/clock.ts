/**
 * Time source used by the rate limiters.
 *
 * Going through an interface instead of calling Date.now() directly makes
 * wall-clock behavior deterministic in tests (see src/core/testing/mockClock.ts).
 */
export interface Clock {
  now(): number
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now()
  }
}