import type { RateLimitPolicy } from '../../core/index.ts'

const POLICIES: Array<{ id: RateLimitPolicy; title: string; blurb: string }> = [
  {
    id: 'sliding-window',
    title: 'Sliding window',
    blurb: 'Strict cap: never more than N requests in any rolling window.',
  },
  {
    id: 'token-bucket',
    title: 'Token bucket',
    blurb: 'Short bursts up to capacity, sustained rate capped by refill.',
  },
]

interface PolicySelectionProps {
  value: RateLimitPolicy
  onChange: (policy: RateLimitPolicy) => void
}

export function PolicySelection({ value, onChange }: PolicySelectionProps) {
  return (
    <div className="policies">
      {POLICIES.map((policy) => (
        <label key={policy.id} className={policy.id === value ? 'policy selected' : 'policy'}>
          <input
            type="radio"
            name="policy"
            checked={policy.id === value}
            onChange={() => onChange(policy.id)}
          />
          <span className="policy-title">{policy.title}</span>
          <span className="policy-blurb">{policy.blurb}</span>
        </label>
      ))}
    </div>
  )
}