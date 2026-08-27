import { useCallback, useEffect, useRef, useState } from 'react'
import { SlidingWindowLimiter } from '../../core/index.ts'
import type { RateLimitPolicy } from '../../core/index.ts'
import { useNow } from '../hooks/useNow.ts'
import { useRateLimiter } from '../hooks/useRateLimiter.ts'
import { LogTable } from './LogTable.tsx'
import { PolicySelection } from './PolicySelection.tsx'
import { StatCards } from './StatCards.tsx'
import { TokenViz, WindowViz } from './WindowViz.tsx'

function parseIntClamped(raw: string, min: number, fallback: number): number {
  const value = Number.parseInt(raw, 10)
  return Number.isNaN(value) ? fallback : Math.max(min, value)
}

export function Demo() {
  const [policy, setPolicy] = useState<RateLimitPolicy>('sliding-window')
  const [limit, setLimit] = useState(6)
  const [windowSeconds, setWindowSeconds] = useState(10)
  const [capacity, setCapacity] = useState(6)
  const [refillPerSecond, setRefillPerSecond] = useState(1)
  const [burstSize, setBurstSize] = useState(14)
  const [keyInput, setKeyInput] = useState('client-1')

  const { check, clear, reset: resetLimiter, logs, lastResult, limiter, trackedKeys } =
    useRateLimiter({
      policy,
      limit,
      windowMs: windowSeconds * 1000,
      capacity,
      refillPerSecond,
    })

  const now = useNow()
  const activeKey = keyInput.trim()

  const slidingHistory =
    policy === 'sliding-window' && activeKey && limiter instanceof SlidingWindowLimiter
      ? limiter.historyOf(activeKey)
      : undefined

  const keyRef = useRef(activeKey)
  useEffect(() => {
    keyRef.current = activeKey
  }, [activeKey])

  const send = useCallback(() => {
    const key = keyRef.current
    if (key.length > 0) {
      check(key)
    }
  }, [check])

  const [bursting, setBursting] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopBurst = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setBursting(false)
  }, [])

  const startBurst = useCallback(() => {
    if (bursting) {
      return
    }
    setBursting(true)
    let sent = 0
    intervalRef.current = setInterval(() => {
      send()
      sent += 1
      if (sent >= burstSize) {
        stopBurst()
      }
    }, 400)
  }, [bursting, burstSize, send, stopBurst])

  useEffect(() => () => stopBurst(), [stopBurst])

  const totals = logs.reduce(
    (acc, entry) => {
      acc.requests += 1
      if (entry.result.allowed) {
        acc.allowed += 1
      } else {
        acc.rejected += 1
      }
      return acc
    },
    { requests: 0, allowed: 0, rejected: 0 },
  )

  const retryAfterSeconds =
    lastResult && !lastResult.result.allowed
      ? Math.max(0, Math.ceil((lastResult.result.resetAtMs - now) / 1000))
      : null

  const rule =
    policy === 'sliding-window'
      ? `${limit} req / ${windowSeconds}s window`
      : `capacity ${capacity} · refill ${refillPerSecond}/s`

  const bucketRemaining =
    activeKey && lastResult && lastResult.key === activeKey ? lastResult.result.remaining : null

  return (
    <main className="demo">
      <section className="card">
        <h2>Policy &amp; limits</h2>
        <PolicySelection value={policy} onChange={setPolicy} />

        {policy === 'sliding-window' ? (
          <div className="num-row">
            <label className="field">
              <span>Requests per window</span>
              <input
                type="number"
                min={0}
                value={limit}
                onChange={(event) => setLimit(parseIntClamped(event.target.value, 0, limit))}
              />
            </label>
            <label className="field">
              <span>Window (seconds)</span>
              <input
                type="number"
                min={1}
                value={windowSeconds}
                onChange={(event) =>
                  setWindowSeconds(parseIntClamped(event.target.value, 1, windowSeconds))
                }
              />
            </label>
          </div>
        ) : (
          <div className="num-row">
            <label className="field">
              <span>Capacity</span>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(event) => setCapacity(parseIntClamped(event.target.value, 1, capacity))}
              />
            </label>
            <label className="field">
              <span>Refill (tokens / sec)</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={refillPerSecond}
                onChange={(event) =>
                  setRefillPerSecond(parseFloat(event.target.value) || refillPerSecond)
                }
              />
            </label>
          </div>
        )}

        <label className="field">
          <span>Client key</span>
          <input
            type="text"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            spellCheck={false}
          />
        </label>

        <div className="num-row">
          <label className="field">
            <span>Burst size</span>
            <input
              type="number"
              min={1}
              value={burstSize}
              onChange={(event) => setBurstSize(parseIntClamped(event.target.value, 1, burstSize))}
            />
          </label>
        </div>

        <div className="actions">
          <button type="button" className="btn primary" onClick={send}>
            Send request
          </button>
          <button type="button" className="btn" onClick={startBurst} disabled={bursting}>
            {bursting ? 'Bursting…' : `Burst x${burstSize}`}
          </button>
          <button type="button" className="btn" onClick={clear}>
            Clear log
          </button>
          <button type="button" className="btn danger" onClick={resetLimiter}>
            Reset
          </button>
        </div>
      </section>

      <div className="column">
        <section className="card">
          <div className="card-head">
            <h2>Throughput</h2>
            <span className="rule-chip">{rule}</span>
          </div>
          <StatCards
            requests={totals.requests}
            allowed={totals.allowed}
            rejected={totals.rejected}
            trackedKeys={trackedKeys}
            retryAfterSeconds={retryAfterSeconds}
          />
        </section>

        <section className="card">
          <div className="card-head">
            <h2>{policy === 'sliding-window' ? 'Window occupancy' : 'Bucket level'}</h2>
            <span className="mono">{activeKey || 'no key'}</span>
          </div>

          {policy === 'sliding-window' ? (
            slidingHistory ? (
              <WindowViz
                history={slidingHistory}
                now={now}
                windowMs={windowSeconds * 1000}
                limit={limit}
              />
            ) : (
              <p className="empty">Enter a client key to inspect its window.</p>
            )
          ) : (
            <TokenViz capacity={capacity} remaining={bucketRemaining} />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Request log</h2>
            <span className="muted">{logs.length} shown</span>
          </div>
          <LogTable logs={logs} />
        </section>
      </div>
    </main>
  )
}