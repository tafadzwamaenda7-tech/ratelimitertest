import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { buildLimiter, rateLimit } from './rateLimit.ts'
import type { ServerOptions } from './rateLimit.ts'

export interface AppOptions extends ServerOptions {
  log?: (line: string) => void
}

const MAX_BODY_BYTES = 64 * 1024

function clientKey(req: IncomingMessage): string {
  const header = req.headers['x-api-key']
  if (typeof header === 'string' && header.trim().length > 0) {
    return header.trim()
  }
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket.remoteAddress ?? 'unknown'
}

function readRequestBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []

    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  })
  res.end(payload)
}

/**
 * The throwaway-pluggable part: a real HTTP server whose one protected
 * endpoint runs every decision through the shared limiter. Constructed
 * without listen() so tests can bind it to an ephemeral port.
 */
export function createAppServer(options: AppOptions = {}): Server {
  const limiter = buildLimiter(options)
  const log = options.log ?? ((line: string) => console.log(line))

  return createServer(async (req, res) => {
    const startedAt = Date.now()
    const key = clientKey(req)

    res.on('finish', () => {
      log(`${req.method} ${req.url} ${res.statusCode} ${key} ${Date.now() - startedAt}ms`)
    })

    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    if (req.url === '/health') {
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.url !== '/api/v1/notify') {
      sendJson(res, 404, { ok: false, error: 'not_found' })
      return
    }

    let bodyText: string
    try {
      bodyText = await readRequestBody(req, MAX_BODY_BYTES)
    } catch {
      sendJson(res, 413, { ok: false, error: 'payload_too_large' })
      return
    }

    try {
      JSON.parse(bodyText)
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const decision = rateLimit(limiter, key)
    sendJson(res, decision.statusCode, { ...decision.body, receivedAt: startedAt }, decision.headers)
  })
}