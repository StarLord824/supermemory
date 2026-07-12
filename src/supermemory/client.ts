import Supermemory from "supermemory";
import type { CuratorConfig } from "../config.js";

export function createClient(config: CuratorConfig): Supermemory {
  return new Supermemory({ apiKey: config.apiKey, baseURL: config.baseUrl });
}

/**
 * Thin authenticated fetch for endpoints the `supermemory` SDK does not cover
 * (profile, review/inferred, forget-matching — see docs/api-verification.md §10).
 * Kept here so every raw HTTP call to Supermemory Local is still confined to
 * this folder, alongside the typed SDK client.
 */
export async function rawRequest<T>(
  config: CuratorConfig,
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supermemory request failed: ${init.method} ${path} → ${res.status} ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
