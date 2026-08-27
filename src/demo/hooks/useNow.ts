import { useEffect, useState } from 'react'

/** Re-renders at a fixed cadence with the current wall-clock time. */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}