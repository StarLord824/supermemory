import type { CuratorConfig } from "../config.js";

/**
 * Thin authenticated fetch used for every Supermemory Local call. We call the
 * confirmed paths directly (see docs/api-verification.md §12) rather than
 * going through the `supermemory` npm SDK, which targets the hosted platform
 * and was never confirmed to route identically against the local binary.
 */
export async function rawRequest<T>(
  config: CuratorConfig,
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // config.apiKey is only ever undefined when resolveConfig determined
  // baseUrl is strict localhost, which accepts unauthenticated requests
  // (confirmed live — see config.ts isLocalhost). Omit the header entirely
  // rather than send "Bearer undefined".
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const res = await fetch(`${config.baseUrl}${path}`, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supermemory request failed: ${init.method} ${path} → ${res.status} ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
