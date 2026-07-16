import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CuratorConfig {
  apiKey: string;
  baseUrl: string;
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
 * actionable message if no API key is found anywhere.
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

  if (!apiKey) {
    throw new Error(
      `Supermemory API key not found. Set SUPERMEMORY_API_KEY in your environment, ` +
        `or ensure ${envFilePath} exists (written by the Supermemory installer).`,
    );
  }

  return { apiKey, baseUrl: baseUrl ?? DEFAULT_BASE_URL };
}
