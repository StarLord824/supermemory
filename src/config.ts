import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CuratorConfig {
  /**
   * Undefined means "send no Authorization header" — only valid when baseUrl
   * is strict localhost (see isLocalhost below), where the server auto-applies
   * its own key to unauthenticated requests (confirmed live 2026-07-17: a
   * real POST /v4/profile with no Authorization header returned 200 with
   * correct data — this is the server's own documented boot-time behavior,
   * not an assumption). See docs/api-verification.md §12/§13.
   */
  apiKey?: string;
  baseUrl: string;
}

/**
 * Strict hostname match only — localhost, 127.0.0.1, or ::1 (with or without
 * IPv6 brackets/port). Deliberately NOT a substring/includes check: a host
 * like "localhost.evil.com" or "my-localhost-proxy" must never match. Parses
 * the URL to isolate exactly the hostname component.
 */
export function isLocalhost(baseUrl: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    return false;
  }
  // Node's URL parser returns IPv6 hostnames with brackets, e.g. "[::1]".
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** Human-readable, redacted description of the resolved API key for status displays. */
export function describeApiKey(apiKey: string | undefined): string {
  if (!apiKey) return "(none — using localhost auto-auth)";
  return `${apiKey.slice(0, 4)}${"*".repeat(Math.max(apiKey.length - 4, 0))}`;
}

export interface ResolveConfigOptions {
  /** Overrides process.env for testing. */
  env?: NodeJS.ProcessEnv;
  /** Overrides the ~/.supermemory/env path for testing. */
  envFilePath?: string;
}

const DEFAULT_BASE_URL = "http://localhost:6767";

/**
 * Parses simple KEY=VALUE lines (as written by the Supermemory installer).
 * Ignores blank lines and lines starting with '#'. Strips surrounding quotes.
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Strip a UTF-8 BOM — PowerShell 5.1's `Out-File -Encoding utf8` writes one,
  // which would otherwise silently break matching the first key.
  for (const rawLine of contents.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

/**
 * Resolves Supermemory credentials. Precedence: process env vars first, then
 * ~/.supermemory/env (written by the Supermemory installer). Throws with an
 * actionable message if no API key is found anywhere — UNLESS baseUrl is
 * strict localhost, where the server accepts unauthenticated requests
 * (confirmed live; see isLocalhost above), so no key is required at all.
 *
 * Exact env var name for the API key is UNVERIFIED against the real installer
 * output — see docs/api-verification.md "Credentials note". SUPERMEMORY_API_KEY
 * is the best-guess name from docs/implementation-plan.md §1.
 */
export function resolveConfig(options: ResolveConfigOptions = {}): CuratorConfig {
  const env = options.env ?? process.env;
  const envFilePath = options.envFilePath ?? join(homedir(), ".supermemory", "env");

  let apiKey = env.SUPERMEMORY_API_KEY;
  let baseUrl = env.SUPERMEMORY_BASE_URL;

  if (!apiKey || !baseUrl) {
    let fileVars: Record<string, string> = {};
    try {
      fileVars = parseEnvFile(readFileSync(envFilePath, "utf8"));
    } catch {
      // File absent or unreadable — fall through to the error below if we
      // still don't have an API key from process env.
    }
    apiKey = apiKey ?? fileVars.SUPERMEMORY_API_KEY;
    baseUrl = baseUrl ?? fileVars.SUPERMEMORY_BASE_URL;
  }

  const resolvedBaseUrl = baseUrl ?? DEFAULT_BASE_URL;

  if (!apiKey) {
    if (isLocalhost(resolvedBaseUrl)) {
      return { apiKey: undefined, baseUrl: resolvedBaseUrl };
    }
    throw new Error(
      `Supermemory API key not found. Set SUPERMEMORY_API_KEY in your environment, ` +
        `or ensure ${envFilePath} exists (written by the Supermemory installer).`,
    );
  }

  return { apiKey, baseUrl: resolvedBaseUrl };
}
