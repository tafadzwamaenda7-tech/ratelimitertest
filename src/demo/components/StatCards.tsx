interface StatCardsProps {
  requests: number
  allowed: number
  rejected: number
  trackedKeys: number
  retryAfterSeconds: number | null
}

export function StatCards({
  requests,
  allowed,
  rejected,
  trackedKeys,
  retryAfterSeconds,
}: StatCardsProps) {
  const hitRate = requests === 0 ? null : Math.round((allowed / requests) * 100)

  const stats: Array<{ label: string; value: string; tone?: 'ok' | 'bad' | 'info' }> = [
    { label: 'Requests', value: String(requests) },
    { label: 'Allowed', value: String(allowed), tone: 'ok' },
    { label: 'Rejected', value: String(rejected), tone: rejected > 0 ? 'bad' : undefined },
    {
      label: 'Hit rate',
      value: hitRate === null ? '-' : `${hitRate}%`,
      tone: hitRate !== null && hitRate >= 80 ? 'bad' : undefined,
    },
    { label: 'Tracked keys', value: String(trackedKeys) },
    {
      label: 'Retry after',
      value: retryAfterSeconds === null ? '-' : `${retryAfterSeconds}s`,
      tone: retryAfterSeconds !== null ? 'info' : undefined,
    },
  ]

  return (
    <div className="stats-grid">
      {stats.map((stat) => (
        <div key={stat.label} className="stat">
          <span className="stat-label">{stat.label}</span>
          <span className={`stat-value ${stat.tone ?? ''}`}>{stat.value}</span>
        </div>
      ))}
    </div>
  )
}