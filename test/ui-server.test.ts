import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type Supermemory from "supermemory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUiRequestHandler } from "../src/ui/server.js";
import type { CuratorConfig } from "../src/config.js";

const config: CuratorConfig = { apiKey: "sm_test_key", baseUrl: "http://localhost:6767" };

let server: Server;
let baseUrl: string;

function fakeClient(overrides: Record<string, unknown>): Supermemory {
  return overrides as unknown as Supermemory;
}

function startTestServer(client: Supermemory) {
  const handler = createUiRequestHandler({ config, client });
  server = createServer((req, res) => void handler(req, res));
  return new Promise<void>((resolve) => {
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

afterEach(() => {
  server?.close();
  vi.restoreAllMocks();
});

describe("GET /api/memories", () => {
  it("delegates to ops.listEntriesWithHistory with the tag query param", async () => {
    const list = vi.fn().mockResolvedValue({ memories: [{ id: "mem_1" }], pagination: {} });
    await startTestServer(fakeClient({ memories: { list } }));

    const res = await fetch(`${baseUrl}/api/memories?tag=src_github`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(list).toHaveBeenCalledWith({ containerTags: ["src_github"] });
    expect(body.memories).toEqual([{ id: "mem_1" }]);
  });
});

describe("GET /api/review", () => {
  it("returns supported:true with results when the endpoint works", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ memories: [{ id: "inf_1" }], total: 1 }),
    }) as unknown as typeof fetch;

    await startTestServer(fakeClient({}));
    const res = await originalFetch(`${baseUrl}/api/review?tag=curator_default`);
    const body = await res.json();

    global.fetch = originalFetch;
    expect(body.supported).toBe(true);
    expect(body.total).toBe(1);
  });

  it("degrades to supported:false instead of a 500 when the endpoint is unsupported", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error("404 not found")) as unknown as typeof fetch;

    await startTestServer(fakeClient({}));
    const res = await originalFetch(`${baseUrl}/api/review?tag=curator_default`);
    const body = await res.json();

    global.fetch = originalFetch;
    expect(res.status).toBe(200);
    expect(body).toEqual({ supported: false, memories: [], total: 0 });
  });
});

describe("POST /api/forget", () => {
  it("defaults dryRun to true and never calls forgetById for mode:'id'", async () => {
    const forget = vi.fn();
    await startTestServer(fakeClient({ memories: { forget } }));

    const res = await fetch(`${baseUrl}/api/forget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "mem_1", mode: "id" }),
    });
    const body = await res.json();

    expect(forget).not.toHaveBeenCalled();
    expect(body.dryRun).toBe(true);
  });

  it("calls forgetById only when dryRun is explicitly false", async () => {
    const forget = vi.fn().mockResolvedValue({ id: "mem_1", forgotten: true });
    await startTestServer(fakeClient({ memories: { forget } }));

    const res = await fetch(`${baseUrl}/api/forget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "mem_1", mode: "id", dryRun: false }),
    });
    const body = await res.json();

    expect(forget).toHaveBeenCalledWith(expect.objectContaining({ id: "mem_1" }));
    expect(body.forgotten).toBe(true);
  });
});

describe("POST /api/review/:id", () => {
  it("rejects an invalid action with 400", async () => {
    await startTestServer(fakeClient({}));
    const res = await fetch(`${baseUrl}/api/review/inf_1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "yolo" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("unknown routes", () => {
  it("returns 404", async () => {
    await startTestServer(fakeClient({}));
    const res = await fetch(`${baseUrl}/api/nonexistent`);
    expect(res.status).toBe(404);
  });
});
