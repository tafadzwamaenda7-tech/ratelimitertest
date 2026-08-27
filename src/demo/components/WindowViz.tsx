interface WindowVizProps {
  history: readonly number[]
  now: number
  windowMs: number
  limit: number
}

/**
 * Timeline of the sliding window for one key: request timestamps aged against
 * the current time. Dots drift left and fall off as the window slides.
 */
export function WindowViz({ history, now, windowMs, limit }: WindowVizProps) {
  const start = now - windowMs
  const live = history.filter((timestamp) => timestamp > start)
  const nearLimit = live.length >= limit - 1

  return (
    <div className="viz">
      <div className="viz-head">
        <span>
          Requests in window <strong>{live.length}</strong> / {limit}
        </span>
        <span className={nearLimit ? 'muted warn' : 'muted'}>
          window is {Math.round(windowMs / 1000)}s
        </span>
      </div>

      <div className="viz-track" role="img" aria-label="Sliding window occupancy">
        {live.map((timestamp, index) => {
          const left = ((timestamp - start) / windowMs) * 100
          const freshness = (now - timestamp) / windowMs
          const opacity = 0.25 + 0.75 * (1 - freshness)
          return (
            <span
              key={`${timestamp}-${index}`}
              className="viz-dot"
              style={{ left: `${left}%`, opacity }}
              title={`${timestamp} (${Math.round((now - timestamp) / 1000)}s ago)`}
            />
          )
        })}
        <span className="viz-now" title="now" />
      </div>

      <div className="viz-axis">
        <span>-{Math.round(windowMs / 1000)}s</span>
        <span>-{Math.round(windowMs / 2000)}s</span>
        <span className="muted">now</span>
      </div>
    </div>
  )
}

interface TokenVizProps {
  capacity: number
  /** Most recent remaining count for the inspected key, or null if unknown. */
  remaining: number | null
}

/** Fills proportionally to how many tokens a key has left. */
export function TokenViz({ capacity, remaining }: TokenVizProps) {
  const filled = remaining === null ? 0 : Math.max(0, Math.min(1, remaining / capacity))
  const empty = filled <= 0

  return (
    <div className="viz">
      <div className="viz-head">
        <span>
          Tokens <strong>{remaining === null ? '—' : Math.floor(remaining)}</strong> / {capacity}
        </span>
        <span className="muted">refilled continuously</span>
      </div>

      <div className="token-track" role="img" aria-label="Bucket occupancy">
        <div
          className={empty ? 'token-fill empty' : 'token-fill'}
          style={{ width: `${filled * 100}%` }}
        />
      </div>
    </div>
  )
}