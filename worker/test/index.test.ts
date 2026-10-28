// Smoke tests for the real Worker entry point's routing. index.ts has no
// Cloudflare-specific dependencies beyond the shape of env.STATE/env.ASSETS,
// both faked here, so this runs under plain Node like everything else.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import worker, { type Env, type KVNamespaceLike } from '../src/index.ts'

function fakeKV(): KVNamespaceLike {
  const map = new Map<string, string>()
  return {
    async get(key) {
      return map.has(key) ? map.get(key)! : null
    },
    async put(key, value) {
      map.set(key, value)
    },
  }
}

const FAKE_MANIFEST = { name: 'Powers Kids Daily Checklist', start_url: '/', id: '/', icons: [] }

function fakeAssets(): { fetch(req: Request): Promise<Response>; requested: string[] } {
  const requested: string[] = []
  return {
    requested,
    async fetch(req: Request) {
      const path = new URL(req.url).pathname
      requested.push(path)
      if (path === '/') {
        return new Response(
          '<html><head><link rel="manifest" href="/manifest.webmanifest"></head>the app</html>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        )
      }
      if (path === '/manifest.webmanifest') {
        return new Response(JSON.stringify(FAKE_MANIFEST), { status: 200, headers: { 'content-type': 'application/manifest+json' } })
      }
      return new Response('asset bytes', { status: 200, headers: { 'content-type': 'application/octet-stream' } })
    },
  }
}

function makeEnv(assets = fakeAssets()): Env {
  return {
    ALEX_TOKEN: 'alex-token-xyz',
    SAM_TOKEN: 'sam-token-xyz',
    PARENT_TOKEN: 'parent-token-xyz',
    PARTNER_TOKEN: 'partner-token-xyz',
    STATE: fakeKV(),
    ASSETS: assets,
  }
}

describe('static asset passthrough: no token required', () => {
  for (const path of ['/assets/index-abc123.js', '/manifest.webmanifest', '/sw.js', '/workbox-9c191d2f.js', '/logo.png', '/pwa-192.png', '/pwa-512.png', '/robots.txt']) {
    test(`${path} passes straight through to ASSETS`, async () => {
      const assets = fakeAssets()
      const env = makeEnv(assets)
      const res = await worker.fetch(new Request('https://example.com' + path), env)
      assert.equal(res.status, 200)
      assert.deepEqual(assets.requested, [path])
    })
  }
})

describe('token-gated page serving', () => {
  test('a valid token serves index.html with no-index/no-referrer/no-store headers', async () => {
    const env = makeEnv()
    const res = await worker.fetch(new Request('https://example.com/alex-token-xyz'), env)
    assert.equal(res.status, 200)
    assert.match(await res.text(), /the app/)
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow')
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(res.headers.get('cache-control'), 'no-store')
  })

  test('both parent tokens work', async () => {
    const env = makeEnv()
    for (const token of ['parent-token-xyz', 'partner-token-xyz']) {
      const res = await worker.fetch(new Request('https://example.com/' + token), env)
      assert.equal(res.status, 200)
    }
  })

  test('a bare / gets the not-found page, not the app', async () => {
    const env = makeEnv()
    const res = await worker.fetch(new Request('https://example.com/'), env)
    assert.equal(res.status, 404)
    assert.match(await res.text(), /Not found/)
  })

  test('an unrecognized token gets the same not-found page', async () => {
    const env = makeEnv()
    const res = await worker.fetch(new Request('https://example.com/totally-made-up'), env)
    assert.equal(res.status, 404)
    assert.match(await res.text(), /Not found/)
  })

  test('the served page points its manifest link at the viewer\'s own token', async () => {
    const env = makeEnv()
    const res = await worker.fetch(new Request('https://example.com/alex-token-xyz'), env)
    assert.match(await res.text(), /href="\/manifest\.webmanifest\?t=alex-token-xyz"/)
  })
})

describe('per-token manifest', () => {
  test('a valid token gets a manifest whose start_url and id are its own link', async () => {
    const env = makeEnv()
    const res = await worker.fetch(new Request('https://example.com/manifest.webmanifest?t=sam-token-xyz'), env)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.start_url, '/sam-token-xyz')
    assert.equal(body.id, '/sam-token-xyz')
    assert.equal(body.name, FAKE_MANIFEST.name)
  })

  test('no token, or a bad one, gets the generic file untouched', async () => {
    const env = makeEnv()
    const res = await worker.fetch(new Request('https://example.com/manifest.webmanifest'), env)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), FAKE_MANIFEST)

    const bad = await worker.fetch(new Request('https://example.com/manifest.webmanifest?t=nope'), env)
    assert.deepEqual(await bad.json(), FAKE_MANIFEST)
  })
})

describe('API routing', () => {
  test('/api/state and /api/mutate are routed to the api handler, not served as pages', async () => {
    const env = makeEnv()
    const res = await worker.fetch(
      new Request('https://example.com/api/state', { headers: { 'x-checklist-token': 'alex-token-xyz' } }),
      env,
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.role, 'alex')
  })

  test('/api/state with no token is 401, unaffected by the page-serving 404 path', async () => {
    const env = makeEnv()
    const res = await worker.fetch(new Request('https://example.com/api/state'), env)
    assert.equal(res.status, 401)
  })
})

describe('unhandled errors', () => {
  test('a throwing ASSETS binding is caught into a 500, not an unhandled rejection', async () => {
    const env = makeEnv()
    env.ASSETS = {
      async fetch() {
        throw new Error('boom')
      },
    }
    const res = await worker.fetch(new Request('https://example.com/alex-token-xyz'), env)
    assert.equal(res.status, 500)
  })
})
