# Rate Limiter

This is a pure TypeScript library implementing an exact sliding-window rate
limiter: the timestamps of allowed requests are kept per client key in an
in-memory `Map` of queues, and `allow(key)` admits a request only when the
rolling window `[now − windowMs, now]` holds fewer than `N` timestamps, which
makes every boundary exact rather than approximate. Time is injected through a
`Clock` interface and all per-key read-modify-write state sits behind a
swappable store interface, so the whole decision layer is deterministic under
tests and a Redis-backed store can replace the in-memory `Map` without touching
the logic. The memory tradeoff is up to `N` timestamps per active key —
`O(N)` per key, `O(keys × N)` total — in exchange for an exactness that
fixed- or sliding-window counters approximate with cheaper constant-per-key
state. The test suite proves the required scenarios: the first request for a
key is always allowed, windows slide exactly at `t + windowMs`, one key
hitting its limit never affects another, and 100-request bursts admit only the
first `N`. A token-bucket policy is included behind the same `allow(key)`
interface, plus idle-key cleanup so memory stays proportional to active
clients. Given more time I would land a distributed store (one atomic
operation per request), an explicit concurrency test across the store seam,
and a configurable cleanup cadence — the seams for all three already exist.

## Usage

```ts
import { createRateLimiter } from './src/core'

const limiter = createRateLimiter({ policy: 'sliding-window', limit: 5, windowMs: 60_000 })

limiter.allow('user-42') // true  (first request always allowed)
limiter.allow('user-42') // true
// ... after 5 admits in the same 60s window ...
limiter.allow('user-42') // false (throttled)
```

## Tests

```bash
npm install
npm test
```

The suite is deterministic — a `MockClock` drives time, so the required
scenarios (window boundaries, first request, key isolation, burst traffic) run
in milliseconds instead of real sleeps.