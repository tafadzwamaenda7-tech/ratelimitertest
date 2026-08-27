import type { RequestLogEntry } from '../hooks/useRateLimiter.ts'

interface LogTableProps {
  logs: readonly RequestLogEntry[]
}

export function LogTable({ logs }: LogTableProps) {
  if (logs.length === 0) {
    return <p className="empty">No requests yet. Send one to start the log.</p>
  }

  return (
    <div className="table-wrap">
      <table className="log-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Key</th>
            <th>Result</th>
            <th>Remaining</th>
            <th>Retry after</th>
            <th>Reset at</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((entry, index) => (
            <tr key={entry.at - index}>
              <td className="mono muted">{new Date(entry.at).toLocaleTimeString()}</td>
              <td className="mono">{entry.key}</td>
              <td>
                <span className={`badge ${entry.result.allowed ? 'badge-ok' : 'badge-rejected'}`}>
                  {entry.result.allowed ? 'allowed' : 'rejected'}
                </span>
              </td>
              <td className="mono">{entry.result.remaining}</td>
              <td className="mono">
                {entry.result.allowed ? '—' : `${Math.ceil(entry.result.retryAfterMs / 1000)}s`}
              </td>
              <td className="mono muted">
                {new Date(entry.result.resetAtMs).toLocaleTimeString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}