# Rate Limiter

A working in-memory rate limiter in TypeScript: an exact sliding-window log is
the default policy (a request is allowed only when fewer than `limit` requests
are recorded inside the rolling `[now − windowMs, now]` window, so there are no
boundary bursts and no approximation), with a token bucket behind the same
interface as a burst-friendly alternative. Time is injected through a `Clock`
interface so every behavior is tested in milliseconds instead of real sleeps,
and all per-key state lives behind one small, swappable store contract that
maps cleanly onto Redis for a distributed deployment. The package ships both a
framework-free library (`src/core`) and a real HTTP backend (`server`) that
runs every `/api/v1/notify` decision through that library and answers
`200` → `429 Too Many Requests` with `x-ratelimit-*` and `Retry-After` headers.
Next steps: a distributed store (single Redis Lua scripts per operation),
per-node local caches with synchronized cleanup, and formal concurrency tests
on the abstraction seam.

## Getting started

```bash
npm install
npm test            # run the full suite once
npm run check       # typecheck + lint + tests
npm run dev         # developer console, http://localhost:5173
npm run serve       # start the real API server, http://127.0.0.1:8080
```

## The real backend

`server/` is a small but real `node:http` server. Run it, then drive it:

```bash
RATE_LIMIT=3 RATE_WINDOW_MS=60000 npm run serve
```

```bash
curl -i -X POST http://127.0.0.1:8080/api/v1/notify \
  -H "content-type: application/json" \
  -H "x-api-key: my-client-1" \
  --data '{"event":"purchase","channel":"email"}'
```

Requests 1–3 return `200`; request 4 onwards return `429 Too Many Requests`
with `retry-after` and `x-ratelimit-limit/remaining/reset` headers. Each
client key (`x-api-key` → `x-forwarded-for` first hop → socket address) gets
its own independent budget.

Environment variables: `PORT` (8080), `HOST` (127.0.0.1),
`RATE_LIMIT` (10), `RATE_WINDOW_MS` (60000), `RATE_LIMIT_POLICY`
(`sliding-window` | `token-bucket`), `RATE_BUCKET_CAPACITY` (5),
`RATE_BUCKET_REFILL` (1/s), and `RATE_LIMIT_POLICY` selects the policy.

## Using the library

```ts
import { createRateLimiter } from './src/core'

const limiter = createRateLimiter({ policy: 'sliding-window', limit: 5, windowMs: 60_000 })

for (let i = 0; i < 6; i++) {
  const res = limiter.consume('user-42')
  console.log(`${i + 1}: ${res.allowed ? 'allowed' : 'rejected'} (${res.remaining} left)`)
}
// 1: allowed (4 left) ... 6: rejected (0 left); res.retryAfterMs says when a slot frees
```

Each decision returns `{ allowed, limit, remaining, resetAtMs, retryAfterMs }`
— everything you need to build `Retry-After` headers, cache decision TTLs, and
dashboards. `allow(key)` is the one-line convenience form used by the spec.

## What's here

- `src/core/` — framework-free library: `Clock`/`SystemClock`/`MockClock`,
  `SlidingWindowLimiter` and `TokenBucketLimiter`, per-key `windowStore` and
  `tokenStore`, `createRateLimiter`, and strict validation (`limit: 0` is a
  legal kill switch; non-positive windows/capacities throw at construction).
- `server/` — the real backend: `rateLimit.ts` (shared decision layer),
  `app.ts` (`createAppServer`), `index.ts` (bootstrap + env + graceful
  shutdown).
- `src/demo/` — a developer console that drives the real library: live
  window/bucket visualization, a per-request log, and an explainer.
- Tests cover store trimming, same-millisecond bursts, exact expiry at
  `t + windowMs`, key isolation, idle cleanup, bucket math, config validation,
  the server decision layer, and a seeded random-traffic suite that re-checks
  the never-exceed-the-limit invariant. The backend is exercised end to end
  over a real socket (200 until the limit, 429 after).
- `.github/workflows/ci.yml` — typecheck, lint, tests, build on every push.

## Design decisions

See `DESIGN.md` for the full write-up: algorithm comparison, exact boundary
semantics (`[t, t + windowMs)`), the Redis mapping, and concurrency.