import type { Clock } from '../clock.ts'

/** Deterministic clock for tests. Start at 0 and step forward explicitly. */
export class MockClock implements Clock {
  private time = 0

  set(time: number): void {
    this.time = time
  }

  advance(ms: number): void {
    this.time += ms
  }

  now(): number {
    return this.time
  }
}