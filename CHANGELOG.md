# Changelog

All notable changes to this project are documented here. Versions follow
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-08-27

### Changed

- Core rewritten around a shared `RateLimiter` contract and explicit store
  seams. `consume()` now returns `{ allowed, limit, remaining, resetAtMs,
  retryAfterMs }` in one call, giving callers Retry-After and dashboard data
  without additional clock reads.
- `SlidingWindowLogRateLimiter` → `SlidingWindowLimiter`; the window store is
  now a dedicated `WindowStore` contract (`admit`), and the token bucket moved
  to a `TokenStore` contract (`consume`), both with in-memory implementations.
- Config validation centralized in `errors.ts` with a single
  `RateLimiterConfigError`; `limit: 0` is a legal kill switch, non-positive
  windows/capacities throw at construction.
- Laid out edges: `limit: 0` rejects everything and tracks nothing; rejections
  are never recorded; boundary expiry is exactly `t + windowMs`.
- Expanded the suite with token-store, window-store, and factory suites plus a
  seeded random-traffic suite that asserts the sliding-window invariant against
  an independent oracle.

### Removed

- Developer console and HTTP server. Part 1 of the assessment targets a pure
  software library with automated tests; no frontend or server is required, so
  the demo code was stripped to keep the deliverable exactly on scope.

## [0.1.0] - 2026-08-27

### Added

- Initial sliding window log rate limiter with injectable `Clock`,
  in-memory key/value store, token bucket policy, and idle-key cleanup.
- Vitest suite driven by `MockClock`.
- TypeScript + Vitest + oxlint toolchain.