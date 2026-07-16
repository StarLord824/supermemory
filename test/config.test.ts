import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { describeApiKey, isLocalhost, parseEnvFile, resolveConfig } from "../src/config.js";

describe("parseEnvFile", () => {
  it("parses KEY=VALUE lines, ignoring blanks and comments", () => {
    const parsed = parseEnvFile(
      "# comment\nSUPERMEMORY_API_KEY=sm_test_123\n\nSUPERMEMORY_BASE_URL='http://localhost:6767'\n",
    );
    expect(parsed).toEqual({
      SUPERMEMORY_API_KEY: "sm_test_123",
      SUPERMEMORY_BASE_URL: "http://localhost:6767",
    });
  });

  it("returns an empty object for empty input", () => {
    expect(parseEnvFile("")).toEqual({});
  });

  it("tolerates a UTF-8 BOM (PowerShell Out-File writes one)", () => {
    const parsed = parseEnvFile("﻿SUPERMEMORY_API_KEY=sm_test_123\n");
    expect(parsed.SUPERMEMORY_API_KEY).toBe("sm_test_123");
  });
});

describe("resolveConfig", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prefers process env over the env file", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-config-"));
    const envFilePath = join(tmpDir, "env");
    writeFileSync(envFilePath, "SUPERMEMORY_API_KEY=from_file\n");

    const config = resolveConfig({
      env: { SUPERMEMORY_API_KEY: "from_env" } as NodeJS.ProcessEnv,
      envFilePath,
    });

    expect(config.apiKey).toBe("from_env");
    expect(config.baseUrl).toBe("http://localhost:6767");
  });

  it("falls back to the env file when process env lacks the key", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-config-"));
    const envFilePath = join(tmpDir, "env");
    writeFileSync(
      envFilePath,
      "SUPERMEMORY_API_KEY=from_file\nSUPERMEMORY_BASE_URL=http://localhost:9999\n",
    );

    const config = resolveConfig({ env: {} as NodeJS.ProcessEnv, envFilePath });

    expect(config.apiKey).toBe("from_file");
    expect(config.baseUrl).toBe("http://localhost:9999");
  });

  it("throws an actionable error when no key is found and baseUrl is NOT localhost", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-config-"));
    const envFilePath = join(tmpDir, "missing-env-file");

    expect(() =>
      resolveConfig({
        env: { SUPERMEMORY_BASE_URL: "https://api.supermemory.ai" } as NodeJS.ProcessEnv,
        envFilePath,
      }),
    ).toThrow(/SUPERMEMORY_API_KEY/);
  });

  it("does NOT throw when no key is found and baseUrl is localhost (auto-auth) — CONFIRMED live 2026-07-17: a real unauthenticated POST /v4/profile against localhost returned 200 with correct data", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-config-"));
    const envFilePath = join(tmpDir, "missing-env-file");

    const config = resolveConfig({ env: {} as NodeJS.ProcessEnv, envFilePath });

    expect(config.apiKey).toBeUndefined();
    expect(config.baseUrl).toBe("http://localhost:6767");
  });

  it("still throws when no key is found and an explicit env file also gives no key, on a non-local baseUrl", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-config-"));
    const envFilePath = join(tmpDir, "env");
    writeFileSync(envFilePath, "SUPERMEMORY_BASE_URL=https://api.supermemory.ai\n");

    expect(() => resolveConfig({ env: {} as NodeJS.ProcessEnv, envFilePath })).toThrow(
      /SUPERMEMORY_API_KEY/,
    );
  });
});

describe("isLocalhost", () => {
  it.each([
    "http://localhost:6767",
    "http://localhost",
    "http://127.0.0.1:6767",
    "http://127.0.0.1",
    "http://[::1]:6767",
  ])("accepts %s", (url) => {
    expect(isLocalhost(url)).toBe(true);
  });

  it.each([
    "https://api.supermemory.ai",
    "http://localhost.evil.com",
    "http://my-localhost-proxy.example",
    "http://192.168.1.1:6767",
    "http://0.0.0.0:6767",
    "not a url at all",
    "",
  ])("rejects lookalike or non-local host %s", (url) => {
    expect(isLocalhost(url)).toBe(false);
  });
});

describe("describeApiKey", () => {
  it("redacts a real key to its first 4 characters", () => {
    expect(describeApiKey("sm_bj1fZzvgZvxXDh3bXfM5FJ_secret")).toBe(
      "sm_b" + "*".repeat("sm_bj1fZzvgZvxXDh3bXfM5FJ_secret".length - 4),
    );
  });

  it("describes an unset key as using localhost auto-auth", () => {
    expect(describeApiKey(undefined)).toContain("auto-auth");
  });
});
