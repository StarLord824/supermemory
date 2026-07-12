import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseEnvFile, resolveConfig } from "../src/config.js";

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

  it("throws an actionable error when no key is found anywhere", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-config-"));
    const envFilePath = join(tmpDir, "missing-env-file");

    expect(() => resolveConfig({ env: {} as NodeJS.ProcessEnv, envFilePath })).toThrow(
      /SUPERMEMORY_API_KEY/,
    );
  });
});
