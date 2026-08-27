import type { AddressInfo } from 'node:net'
import { afterAll, describe, expect, it } from 'vitest'
import { createAppServer } from '../app.ts'

interface RunningServer {
  baseUrl: string
  close: () => Promise<void>
}

const servers: RunningServer[] = []

async function startServer(): Promise<RunningServer> {
  const server = createAppServer({ policy: 'sliding-window', limit: 4, windowMs: 60_000 })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      const running: RunningServer = {
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      }
      servers.push(running)
      resolve(running)
    })
  })
}

afterAll(async () => {
  await Promise.all(servers.map((server) => server.close()))
})

describe('the real HTTP server', () => {
  it('returns 200 until the limit, then 429 with Retry-After, for one key', async () => {
    const { baseUrl, close } = await startServer()
    const statuses: number[] = []
    let remainingOnFirst: string | null = null
    let retryOnLast: string | null = null

    try {
      for (let i = 0; i < 9; i += 1) {
        const res = await fetch(`${baseUrl}/api/v1/notify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': 'integration-client' },
          body: JSON.stringify({ event: 'signup', channel: 'email' }),
        })
        if (i === 0) {
          remainingOnFirst = res.headers.get('x-ratelimit-remaining')
        }
        if (i === 8) {
          retryOnLast = res.headers.get('retry-after')
        }
        statuses.push(res.status)
      }
    } finally {
      await close()
    }

    expect(statuses.slice(0, 4)).toEqual([200, 200, 200, 200])
    expect(statuses.slice(4)).toEqual([429, 429, 429, 429, 429])
    expect(remainingOnFirst).toBe('3')
    expect(retryOnLast).not.toBeNull()
  })

  it('gives a second API key its own budget', async () => {
    const { baseUrl, close } = await startServer()
    try {
      for (let i = 0; i < 5; i += 1) {
        await fetch(`${baseUrl}/api/v1/notify`, {
          method: 'POST',
          headers: { 'x-api-key': 'pent-up-key' },
          body: '{}',
        })
      }

      const fresh = await fetch(`${baseUrl}/api/v1/notify`, {
        method: 'POST',
        headers: { 'x-api-key': 'fresh-key' },
        body: '{}',
      })
      expect(fresh.status).toBe(200)

      const exhausted = await fetch(`${baseUrl}/api/v1/notify`, {
        method: 'POST',
        headers: { 'x-api-key': 'pent-up-key' },
        body: '{}',
      })
      expect(exhausted.status).toBe(429)
    } finally {
      await close()
    }
  })

  it('answers 404 for unknown routes and 405 for GET', async () => {
    const { baseUrl, close } = await startServer()
    try {
      const missing = await fetch(`${baseUrl}/api/v1/wrong`, { method: 'POST', body: '{}' })
      expect(missing.status).toBe(404)

      const wrongMethod = await fetch(`${baseUrl}/api/v1/notify`, { method: 'GET' })
      expect(wrongMethod.status).toBe(405)

      const badJson = await fetch(`${baseUrl}/api/v1/notify`, {
        method: 'POST',
        body: 'not-json',
      })
      expect(badJson.status).toBe(400)
    } finally {
      await close()
    }
  })
})