import { afterEach, describe, expect, it, vi } from "vitest";
import { rawRequest } from "../src/supermemory/client.js";
import type { CuratorConfig } from "../src/config.js";

describe("rawRequest", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends a Bearer Authorization header when apiKey is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const config: CuratorConfig = { apiKey: "sm_test_key", baseUrl: "http://localhost:6767" };

    await rawRequest(config, "/v3/documents", { method: "POST", body: {} });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer sm_test_key");
  });

  it("omits the Authorization header entirely when apiKey is undefined (localhost auto-auth)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const config: CuratorConfig = { apiKey: undefined, baseUrl: "http://localhost:6767" };

    await rawRequest(config, "/v3/documents", { method: "POST", body: {} });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
    expect("Authorization" in init.headers).toBe(false);
  });

  it("never sends the literal string 'Bearer undefined'", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const config: CuratorConfig = { apiKey: undefined, baseUrl: "http://localhost:6767" };

    await rawRequest(config, "/v3/documents", { method: "POST", body: {} });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.stringify(init.headers)).not.toContain("undefined");
  });
});
