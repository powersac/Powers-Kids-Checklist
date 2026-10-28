// An in-memory stand-in for the KV-backed store, for testing api.ts without
// any Cloudflare bindings. Mirrors the shape Store expects in src/api.ts.

import type { Store } from '../src/api.ts'
import type { SyncedData } from '../src/ops.ts'

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x))
}

export interface FakeStore extends Store {
  // Test-only escape hatch to inspect what's actually persisted.
  peek(): { rev: number; data: SyncedData }
}

// delayMs, when set, makes get()/put() yield a real macrotask before
// resolving. Two handle() calls fired together with Promise.all will then
// both complete their initial read before either reaches put(), which is
// what makes the optimistic-concurrency race reproducible on demand instead
// of depending on incidental microtask ordering.
export function createFakeStore(initialData: SyncedData, initialRev = 0, delayMs = 0): FakeStore {
  let rev = initialRev
  let data = clone(initialData)

  function tick(): Promise<void> {
    return delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve()
  }

  return {
    async get() {
      await tick()
      return { rev, data: clone(data) }
    },
    async put(newData, expectedRev) {
      await tick()
      if (expectedRev !== rev) return false
      rev += 1
      data = clone(newData)
      return true
    },
    peek() {
      return { rev, data: clone(data) }
    },
  }
}
