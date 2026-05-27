/**
 * fetchWithRetry — wraps a fetch call with automatic retries.
 *
 * Retries on:
 *   - Network errors (fetch throws)
 *   - 5xx server errors (transient back-end failures)
 *
 * Does NOT retry on:
 *   - 4xx client errors (auth, validation — deterministic, retrying won't help)
 *
 * Uses exponential back-off: delay = baseDelayMs × 2^(attempt-1)
 * Default: 3 attempts, starting at 300 ms → 300 ms, 600 ms
 */
export async function fetchWithRetry(
  factory: () => Promise<Response>,
  {
    maxAttempts = 3,
    baseDelayMs = 300,
  }: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await factory()
      // 4xx → deterministic failure, surface immediately
      if (res.ok || (res.status >= 400 && res.status < 500)) return res
      // 5xx → transient, fall through to retry
      lastError = new Error(`HTTP ${res.status}`)
    } catch (err) {
      // Network error (offline, DNS, timeout) → retry
      lastError = err
    }
    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)))
    }
  }
  throw lastError
}
