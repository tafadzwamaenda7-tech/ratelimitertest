import { useCallback, useMemo, useState } from 'react'
import { createRateLimiter, SystemClock } from '../../core/index.ts'
import type { RateLimitConsumption, RateLimitPolicy, RateLimiter } from '../../core/index.ts'

export interface RateLimiterSettings {
  policy: RateLimitPolicy
  limit: number
  windowMs: number
  capacity: number
  refillPerSecond: number
}

export interface RequestLogEntry {
  key: string
  result: RateLimitConsumption
  at: number
}

const MAX_LOG_ENTRIES = 60

/**
 * Owns one limiter instance for the given settings, plus the request history
 * that drives the inspector. The limiter is rebuilt only when a setting changes
 * or the user hits Reset — a normal request, never a fake one.
 */
export function useRateLimiter(settings: RateLimiterSettings) {
  const config = useMemo(
    () =>
      settings.policy === 'token-bucket'
        ? {
            policy: 'token-bucket' as const,
            capacity: settings.capacity,
            refillPerSecond: settings.refillPerSecond,
          }
        : {
            policy: 'sliding-window' as const,
            limit: settings.limit,
            windowMs: settings.windowMs,
          },
    [settings.policy, settings.limit, settings.windowMs, settings.capacity, settings.refillPerSecond],
  )

  const [instance, setInstance] = useState(() => ({
    config,
    limiter: createRateLimiter(config, new SystemClock()),
  }))
  const limiter: RateLimiter = instance.config === config ? instance.limiter : rebuild()

  function rebuild(): RateLimiter {
    const next = createRateLimiter(config, new SystemClock())
    setInstance({ config, limiter: next })
    return next
  }

  const [logs, setLogs] = useState<RequestLogEntry[]>([])
  const [lastResult, setLastResult] = useState<RequestLogEntry | null>(null)

  const check = useCallback(
    (key: string): RateLimitConsumption => {
      const result = limiter.consume(key)
      const entry: RequestLogEntry = { key, result, at: Date.now() }
      setLastResult(entry)
      setLogs((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES))
      return result
    },
    [limiter],
  )

  const clear = useCallback(() => {
    setLogs([])
    setLastResult(null)
  }, [])

  const reset = useCallback(() => {
    setLogs([])
    setLastResult(null)
    setInstance({ config, limiter: createRateLimiter(config, new SystemClock()) })
  }, [config])

  return {
    check,
    clear,
    reset,
    logs,
    lastResult,
    limiter,
    trackedKeys: limiter.trackedKeys(),
  }
}