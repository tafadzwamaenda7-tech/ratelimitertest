# Design

This document records the decisions behind the rate limiter: what problem it
solves, how the algorithms were chosen, the exact semantics the tests pin
down, and how the same core is meant to move into a server and a distributed
deployment without a rewrite.

## 1. Problem

A rate limiter sits in front of an operation with a cost budget — an API, a
queue, a notification gateway. It answers one question per incoming request:

> Should this client be allowed to proceed right now?

The two requirements that shape everything else:

- **Exactness matters.** Approximate counter algorithms let a client burst at
  window boundaries. For a paid or metered backend, those bursts are real cost.
- **The answer must be reproducible from tests.** No sleeps in the suite; time
  is an injected dependency.

## 2. Algorithm choice

| Algorithm | Exact | Notes |
| --- | --- | --- |
| Fixed window counter | No | Terrible: boundaries double throughput (`0..N` in `[0,60)`, `N+1..2N` in `[60,120)`). |
| Sliding window counter | No | Smooths fixed buckets but hedges the count with weighted halves. |
| Token bucket | Policy-wise | Exact by construction, but allows bounded bursts and long-tail overload within a burst. |
| Sliding window log | **Yes** | First-class: `N` requests per any rolling `T`. |

Default policy is the sliding window log; token bucket is available for
endpoints that want controlled bursts (a connection spike on deploy, a
back-queue drain).

## 3. Semantics

### 3.1 Sliding window

State per key is an ascending list of admitted timestamps. A request at time
`now` is admitted when

```
live  = { t ∈ history | t > now − windowMs }
allowed = live.length < limit
```

Boundary rule: a request lands in `[t, t + windowMs)`, i.e. it stops counting
at exactly `t + windowMs`. A request arriving at `t + windowMs` sees the older
request gone. Implemented as eviction `t ≤ now − windowMs` — inclusive, so the
boundary equality holds under a monotonic clock.

Decisions:

- **Limit 0.** Legal. Rejects everything, tracks nothing, reports
  `remaining: 0`. Useful as a kill switch without special-casing.
- **Rejections are not recorded.** A rejected request never enters the log, so
  failing clients can't extend their own waiting penalty past the window.
- **Admission then trim.** The trim happens on the previous state, then the
  new timestamp is appended only if admitted. One pass, no partial updates.
- **Non-positive window.** `windowMs ≤ 0` throws at construction. A limiter
  that admits only at one exact millisecond is a bug, not a feature.

### 3.2 Token bucket

State per key is `(tokens, lastRefill)`. Every operation catches the bucket up
via `tokens = min(capacity, tokens + elapsed · rate)` before deciding.
`refillPerMs = refillPerSecond / 1000`, with `ceil` on the Retry-After so the
header promises the first moment a request *will* be admitted.

`capacity ≤ 0` throws. Clients want a well-defined bucket; a zero-capacity
policy is a `limit: 0` sliding window instead.

### 3.3 Shared contract

Both policies reduce to the same shape, which keeps the factory and callers
boring:

```ts
interface RateLimiter {
  consume(key: string): RateLimitConsumption // allowed, remaining, resetAtMs, retryAfterMs
  trackedKeys(): number
  cleanupIdle(idleMs: number): number
}
```

`allow(key)` is a one-line convenience over `consume()`. `resetAtMs` /
`retryAfterMs` are derived from state the policy already holds — no extra
clocks, no bookkeeping — and map directly to `Retry-After`. When allowed,
`retryAfterMs` is `0` and `resetAtMs` is the oldest live timestamp's expiry
(sliding) or the next refill instant (bucket), so dashboards can show a real
"refills at" rather than a guess.

## 4. Storage seam

Per-key read-modify-write is the only mutation. It is isolated behind a tiny
interface so the "in-memory here" and "production Redis" versions share the
entire decision layer:

- `WindowStore.admit(key, now, cutoff, limit) → { allowed, remaining, oldest }`
  — atomic per key, trims, admits, reports.
- `TokenStore.consume(key, now, capacity, rate) → { allowed, remaining, tokens }`

In this repo the implementations are `Map`s. The Redis mapping is one Lua
script per operation so a round-trip stays atomic (section 7). Rebuilding the
store is the only change required to go multi-node.

## 5. Keys and cleanup

Keys are opaque strings; the library never parses them. Empty or
whitespace-only keys throw (`TypeError`) — indexing by `""` makes every
client share one bucket, a footgun. Validating shape (IP, user id, API key) is
the caller's job.

`cleanupIdle(idleMs)` removes keys with no activity in the interval and
returns how many were reclaimed. Deployments run it on a timer at a large
interval (minutes) to keep memory proportional to *active* clients, not all
clients ever. `trackedKeys()` exists for exactly one purpose: dashboards and
debugging. Nothing in the hot path iterates keys.

## 6. Time

`Clock` is a one-method interface, `now()` (epoch ms). Every limiter takes
one, defaulting to `SystemClock`. Tests inject `MockClock` and step time
explicitly:

- advance the mock, request, assert — no timers, deterministic, CI-friendly.

Monotonicity is assumed. `Date.now()` is monotonic-in-practice on every
supported runtime (Node and evergreen browsers), which is why the default is
`SystemClock`; runtimes with an NTP-slewable wall clock (and no monotonic
source) should inject one and accept the trade-off.

## 7. Concurrency

In Node.js a synchronous `consume()` can't be preempted, so the Map
implementation is correct by construction for a single process.

The store interface is the contract this correctness rests on. Behind the
interface the load-bearing requirement is: **each call is atomic per key.**
That is:

- in-memory: the `Map` method is a single synchronous operation;
- multi-threaded (e.g. a Java port): `ConcurrentHashMap.compute(key, …)` or
  the equivalent;
- distributed (Redis): one `EVAL` per call.

There is deliberately no global lock and no transaction spanning keys —
nothing above the store needs one.

### Redis mapping

| Operation | Redis |
| --- | --- |
| Sliding admit | `ZREMRANGEBYSCORE key -inf cutoff`, `ZCARD`, conditionally `ZADD` — one Lua script |
| Sliding clean/idle | `SCAN` + `OBJECT IDLETIME` is approximating; scripts + `TTL` instead |
| Bucket consume | `GET`/`SET` of `{tokens, lastRefill}` stringified — one Lua script |

Keys expire via `EXPIRE` on any store touch, sized to `windowMs` + margin, so
idle keys disappear without a sweeper.

## 8. Errors

Config validation is centralized (`assertLimit`, `assertWindowMs`,
`assertCapacity`, `assertRefillPerSecond`, `assertIdleMs`, `assertKey`) and
throws a single `RateLimiterConfigError extends TypeError` with a message that
names the field and the accepted range. Callers catch config errors at boot,
not per request. Invalid *keys* throw plain `TypeError` — a programming error,
not a misconfiguration.

## 9. Testing

Two layers.

1. **Unit/invariant cases** — boundary expiry at exactly `t + windowMs`,
   same-millisecond multi-request bursts, key isolation, idle cleanup,
   rejection-not-recorded, bucket refill rounding and Retry-After `ceil`,
   config rejection. All driven by `MockClock`.
2. **Random-traffic invariant suite** — a seeded PRNG (mulberry32) generates a
   schedule of requests from several clients with pauses. A naive oracle
   recomputes each key's live window at every event, and the test asserts the
   limiter's decisions never admit beyond the oracle's limit in *any* 60s
   window. The seed makes the suite reproducible; the same harness also
   asserts token-bucket "never minted above capacity + elapsed refill."

The suite is deterministic: same commit, same pass/fail, CI included. The
tests drive the public API (`createRateLimiter`, `allow`, `consume`), never
internal classes, so a refactor can't silently break the contract.

## 10. Monitoring

`consume()` already returns everything an observability layer needs:

- `allowed` — true/false per request;
- `remaining` — headroom, the primary saturation signal;
- `resetAtMs` / `retryAfterMs` — per-key wait state without an extra clock.

Rate of `allowed=false`, `remaining ≈ 0` share, and `retryAfterMs` distribution
are the three metrics to graph. Nothing extra to add in the hot path.

## 11. Shipping boundary

This repo pins the *decision layer* only. The runtime that matters — a
middleware calling `consume()` with `req.ip` or a signed user id as the key,
`429` + `Retry-After` on rejection, wired to the Redis store — reuses the
core unchanged. That middleware is a few dozen lines and lives out of tree so
the assessment deliverable stays a pure library, as specified.