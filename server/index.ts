import { createAppServer } from './app.ts'

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined) {
    return fallback
  }
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

function policyFromEnv(): 'sliding-window' | 'token-bucket' {
  return process.env.RATE_LIMIT_POLICY === 'token-bucket' ? 'token-bucket' : 'sliding-window'
}

const config = {
  policy: policyFromEnv(),
  limit: intFromEnv('RATE_LIMIT', 10),
  windowMs: intFromEnv('RATE_WINDOW_MS', 60_000),
  capacity: intFromEnv('RATE_BUCKET_CAPACITY', 5),
  refillPerSecond: intFromEnv('RATE_BUCKET_REFILL', 1),
}

const port = intFromEnv('PORT', 8080)
const host = process.env.HOST ?? '127.0.0.1'

const server = createAppServer(config)

server.listen(port, host, () => {
  const rule =
    config.policy === 'sliding-window'
      ? `${config.policy} — ${config.limit} req / ${config.windowMs}ms`
      : `${config.policy} — capacity ${config.capacity}, refill ${config.refillPerSecond}/s`
  console.log(`[rate-limiter] listening on http://${host}:${port}`)
  console.log(`[rate-limiter] policy: ${rule}`)
  console.log(`[rate-limiter] POST /api/v1/notify requires an x-api-key header`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[rate-limiter] received ${signal}, draining connections`)
    server.close(() => process.exit(0))
  })
}