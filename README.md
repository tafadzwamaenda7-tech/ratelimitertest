# Rate Limiter Implementation

A reusable in-memory rate limiter implementing both Sliding Window and Token
Bucket policies behind a common interface. Time is injected via a `Clock`
abstraction for deterministic testing, and the storage layer is abstracted via
a Store interface, allowing future replacement with a distributed cache like
Redis. The factory pattern allows runtime policy selection, and idle keys are
reclaimed via `cleanupIdle(idleMs)` so memory stays proportional to active
clients. With more time, I would add load-testing benchmarks that exercise the
hot path at production throughput.

## Running & testing

```bash
npm install
npm test          # 45-test suite: sliding window, token bucket, cleanup, concurrency
npm run check     # typecheck + lint + tests
```

See the limiter throttle in action from the terminal (Node 24 runs the
TypeScript directly):

```bash
node -e "import('./src/core/index.ts').then(m => { const l = m.createRateLimiter({ policy: 'sliding-window', limit: 3, windowMs: 60000 }); for (let i = 0; i < 5; i++) console.log('req', i + 1, l.allow('user-42')); })"
```

Expected output — the first 3 requests are allowed, then throttled:

```
req 1 true
req 2 true
req 3 true
req 4 false
req 5 false
```

## Usage

```ts
import { createRateLimiter } from './src/core'

const limiter = createRateLimiter({ policy: 'sliding-window', limit: 5, windowMs: 60_000 })

limiter.allow('user-42') // true
```

Swap the policy at runtime via the factory:

```ts
const bursty = createRateLimiter({ policy: 'token-bucket', capacity: 10, refillPerSecond: 2 })
```