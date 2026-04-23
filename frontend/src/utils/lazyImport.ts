import { ComponentType, lazy as reactLazy } from "react";

/** Last time we triggered a full reload due to a missing/stale code chunk. */
const CHUNK_RELOAD_AT_KEY = "panorama_chunk_reload_at_ms";

const BURST_MS = 5000;

function isChunkLoadError(e: unknown): boolean {
  if (!e) return false;
  if (e instanceof TypeError) {
    const m = e.message;
    if (
      m.includes("Failed to fetch") ||
      m.includes("dynamically imported module") ||
      m.includes("error loading")
    ) {
      return true;
    }
  }
  const any = e as { name?: string; message?: string };
  if (any.name === "ChunkLoadError") return true;
  if (String(any.message).includes("Failed to fetch")) return true;
  return false;
}

/**
 * React.lazy that recovers from stale production bundles: after a new deploy, old
 * tabs still reference old hashed chunk URLs (404) until the page is reloaded.
 */
export function lazy<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>
) {
  return reactLazy(async () => {
    try {
      return await importFn();
    } catch (e) {
      if (!isChunkLoadError(e)) throw e;

      const now = Date.now();
      const prev = sessionStorage.getItem(CHUNK_RELOAD_AT_KEY);
      if (prev) {
        const last = parseInt(prev, 10);
        if (!Number.isNaN(last) && now - last < BURST_MS) {
          sessionStorage.removeItem(CHUNK_RELOAD_AT_KEY);
          throw e;
        }
      }
      sessionStorage.setItem(CHUNK_RELOAD_AT_KEY, String(now));
      window.location.reload();
      return new Promise<never>(() => {});
    }
  });
}
