// The real Worker entry point. This is the only file that touches Cloudflare
// bindings (KV + the static assets binding) — routing and business logic
// live in api.ts/ops.ts so they can be unit-tested without a Workers runtime.

import { handle, roleFor, type Env as ApiEnv } from './api.ts'
import { seedData, type SyncedData } from './ops.ts'

// Minimal surface of Cloudflare's KVNamespace — just what makeStore uses.
// Not importing @cloudflare/workers-types keeps this dependency-free, same
// spirit as the grocery app.
export interface KVNamespaceLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

export interface Env extends ApiEnv {
  STATE: KVNamespaceLike
  ASSETS: { fetch(request: Request): Promise<Response> }
}

const KEY = 'state'

function makeStore(env: Env) {
  return {
    async get(): Promise<{ rev: number; data: SyncedData }> {
      const raw = await env.STATE.get(KEY)
      if (!raw) return { rev: 0, data: seedData() }
      try {
        const o = JSON.parse(raw)
        if (!o || typeof o.rev !== 'number' || !o.data) throw new Error('shape')
        return o
      } catch {
        // Never hand a corrupt blob to the page. An empty checklist is
        // recoverable; a page that will not render is not.
        return { rev: -1, data: seedData() }
      }
    },
    async put(data: SyncedData, expectedRev: number): Promise<boolean> {
      const cur = await this.get()
      if (cur.rev !== expectedRev) return false
      await env.STATE.put(KEY, JSON.stringify({ rev: cur.rev + 1, data }))
      return true
    },
  }
}

// Paths served straight from the built React app's static output, no token
// required — none of them contain anything sensitive. manifest.webmanifest is
// handled separately below: its start_url has to point at the viewer's own
// token, or "Add to Home Screen" on Android would install an icon that always
// opens the bare, unauthenticated "/".
const STATIC_ASSET_RE =
  /^\/(assets\/|sw\.js$|workbox-[^/]*\.js$|logo\.png$|pwa-192\.png$|pwa-512\.png$|robots\.txt$)/

const NOT_FOUND_HTML =
  '<!doctype html><meta charset=utf-8><title>Not found</title>' +
  '<body style="font:17px system-ui;padding:3rem;max-width:30rem;margin:0 auto">' +
  '<h1 style="font-size:1.3rem">Not found</h1>' +
  '<p>Check the link. It is long and easy to cut short when copying.</p>'

const NO_INDEX_HEADERS = {
  'cache-control': 'no-store',
  // The page is only reachable by its secret link; keep it out of search
  // indexes and out of referrer headers so the token never leaks elsewhere.
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
}

function notFoundPage(): Response {
  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8', ...NO_INDEX_HEADERS },
  })
}

async function servePage(request: Request, token: string, env: Env): Promise<Response> {
  // Cloudflare's assets binding applies its default html_handling to an
  // explicit "/index.html" request and 307-redirects it to "/" — asking for
  // the canonical "/" directly is what actually returns the page with a 200.
  const indexReq = new Request(new URL('/', request.url), request)
  const res = await env.ASSETS.fetch(indexReq)
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(NO_INDEX_HEADERS)) headers.set(k, v)
  // Point the manifest link at this viewer's own token so an installed icon
  // reopens their link, not the bare "/".
  const html = (await res.text()).replace(
    '/manifest.webmanifest',
    `/manifest.webmanifest?t=${encodeURIComponent(token)}`,
  )
  return new Response(html, { status: res.status, headers })
}

async function serveManifest(url: URL, env: Env): Promise<Response> {
  const token = url.searchParams.get('t') || ''
  const role = roleFor(token, env)
  const assetReq = new Request(new URL('/manifest.webmanifest', url))
  const res = await env.ASSETS.fetch(assetReq)
  if (!role) return res // no/bad token — hand back the generic file untouched
  const manifest = (await res.json()) as Record<string, unknown>
  manifest.start_url = `/${token}`
  manifest.id = `/${token}`
  return new Response(JSON.stringify(manifest), {
    status: res.status,
    headers: { 'content-type': 'application/manifest+json', 'cache-control': 'no-store' },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url)
      const path = url.pathname

      // Known static asset paths pass straight through, untouched, no token
      // check — they contain nothing sensitive.
      if (STATIC_ASSET_RE.test(path)) return await env.ASSETS.fetch(request)

      if (path === '/manifest.webmanifest') return await serveManifest(url, env)

      // The API surface: token in a header, business logic in api.ts.
      if (path === '/api/state' || path === '/api/mutate') {
        return await handle(request, env, makeStore(env), Date.now())
      }

      // Everything else (bare "/", or "/<token>") is a page request: the
      // token is the path itself.
      if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json' },
      })

      const token = path === '/' ? '' : path.slice(1)
      const role = roleFor(token, env)
      if (!role) return notFoundPage()

      return await servePage(request, token, env)
    } catch {
      return new Response(JSON.stringify({ error: 'server_error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    }
  },
}
