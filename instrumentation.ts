/**
 * Next.js instrumentation - runs at server startup before any request.
 * Fixes Node.js broken localStorage from --localstorage-file (invalid path).
 * Node exposes a proxy that rejects property writes, so we replace it with a stub.
 */
const stubStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
};

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const g = globalThis as typeof globalThis & { localStorage?: typeof stubStorage };
    if (g.localStorage && typeof g.localStorage.getItem !== "function") {
      g.localStorage = stubStorage;
    }
  }
}
