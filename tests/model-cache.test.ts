import test from "node:test";
import assert from "node:assert/strict";
import {
  loadCachedModel,
  type ModelLoadProgress,
} from "../src/game/model-cache.ts";
function storage() {
  const entries = new Map<string, Response>();
  return {
    entries,
    cache: {
      match: async (k: string) => entries.get(k)?.clone(),
      put: async (k: string, r: Response) => {
        entries.set(k, r.clone());
      },
      delete: async (k: string) => entries.delete(k),
    },
  };
}
const validate = (b: ArrayBuffer) => {
  const v = new Uint8Array(b);
  if (v.length !== 4 || v[0] !== 7) throw Error("Invalid model");
  return Array.from(v);
};
test("streams real progress, persists model and reuses it in a fresh loader", async () => {
  const { entries, cache } = storage();
  const store = { open: async () => cache } as unknown as CacheStorage;
  let fetches = 0;
  const progress: ModelLoadProgress[] = [];
  const request = (async () => {
    fetches++;
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([7, 2]));
          c.enqueue(new Uint8Array([3, 4]));
          c.close();
        },
      }),
      { headers: { "content-length": "4" } },
    );
  }) as typeof fetch;
  assert.deepEqual(
    await loadCachedModel(
      "/model-v7",
      4,
      validate,
      (p) => progress.push(p),
      store,
      request,
    ),
    [7, 2, 3, 4],
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(entries.size, 1);
  assert.deepEqual(
    progress.filter((p) => p.phase === "download").map((p) => p.loaded),
    [0, 2, 4],
  );
  assert.equal(progress.at(-1)?.phase, "ready");
  assert.deepEqual(
    await loadCachedModel("/model-v7", 4, validate, () => {}, store, request),
    [7, 2, 3, 4],
  );
  assert.equal(fetches, 1);
});
test("corrupt cached model is deleted and redownloaded", async () => {
  const { entries, cache } = storage();
  entries.set("/model-v7", new Response(new Uint8Array([0])));
  let fetched = 0;
  const request = (async () => {
    fetched++;
    return new Response(new Uint8Array([7, 2, 3, 4]));
  }) as typeof fetch;
  assert.deepEqual(
    await loadCachedModel(
      "/model-v7",
      4,
      validate,
      () => {},
      { open: async () => cache } as unknown as CacheStorage,
      request,
    ),
    [7, 2, 3, 4],
  );
  assert.equal(fetched, 1);
});
test("unavailable persistent storage still downloads; invalid downloads are never cached", async () => {
  let stored = 0;
  const store = {
    open: async () => {
      throw Error("Quota");
    },
  } as unknown as CacheStorage;
  assert.deepEqual(
    await loadCachedModel(
      "/x",
      4,
      validate,
      () => {},
      store,
      (async () => new Response(new Uint8Array([7, 2, 3, 4]))) as typeof fetch,
    ),
    [7, 2, 3, 4],
  );
  const cache = {
    match: async () => undefined,
    put: async () => {
      stored++;
    },
  } as unknown as Cache;
  await assert.rejects(
    loadCachedModel(
      "/x",
      4,
      validate,
      () => {},
      { open: async () => cache } as unknown as CacheStorage,
      (async () => new Response("<html>")) as typeof fetch,
    ),
    /Invalid model/,
  );
  assert.equal(stored, 0);
});
