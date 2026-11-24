export type ModelLoadProgress = {
  phase: "cache" | "download" | "initialize" | "ready";
  loaded: number;
  total?: number;
};
export async function loadCachedModel<T>(
  url: string,
  expectedBytes: number,
  validate: (bytes: ArrayBuffer) => T,
  report: (progress: ModelLoadProgress) => void,
  storage: CacheStorage | undefined = typeof caches === "undefined"
    ? undefined
    : caches,
  request: typeof fetch = fetch,
): Promise<T> {
  report({ phase: "cache", loaded: 0 });
  let cache: Cache | undefined;
  try {
    cache = await storage?.open("jaipur-models-v1");
  } catch {
    /* Storage is optional. */
  }
  try {
    const cached = await cache?.match(url);
    if (cached) {
      const bytes = await cached.arrayBuffer();
      report({
        phase: "initialize",
        loaded: bytes.byteLength,
        total: bytes.byteLength,
      });
      const model = validate(bytes);
      report({
        phase: "ready",
        loaded: bytes.byteLength,
        total: bytes.byteLength,
      });
      return model;
    }
  } catch {
    try {
      await cache?.delete(url);
    } catch {
      /* Fall back to download. */
    }
  }
  report({ phase: "download", loaded: 0, total: expectedBytes });
  const response = await request(url, { cache: "force-cache" });
  if (!response.ok) throw Error("对手模型下载失败，请重试");
  const length = Number(response.headers.get("content-length"));
  const total = response.headers.get("content-encoding")
    ? expectedBytes
    : length > 0
      ? length
      : expectedBytes;
  let bytes: ArrayBuffer;
  if (response.body) {
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let loaded = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        loaded += value.byteLength;
        report({ phase: "download", loaded, total: Math.max(total, loaded) });
      }
    } finally {
      reader.releaseLock();
    }
    const joined = new Uint8Array(loaded);
    let at = 0;
    for (const part of parts) {
      joined.set(part, at);
      at += part.byteLength;
    }
    bytes = joined.buffer;
  } else bytes = await response.arrayBuffer();
  report({
    phase: "initialize",
    loaded: bytes.byteLength,
    total: bytes.byteLength,
  });
  const model = validate(bytes); // Cache only a complete, valid model of the expected version.
  void cache?.put(url, new Response(bytes.slice(0))).catch(() => {});
  report({ phase: "ready", loaded: bytes.byteLength, total: bytes.byteLength });
  return model;
}
