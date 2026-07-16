import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUiRequestHandler } from "../src/ui/server.js";
import type { CuratorConfig } from "../src/config.js";

const config: CuratorConfig = { apiKey: "sm_test_key", baseUrl: "http://localhost:6767" };
const realFetch = global.fetch;

let server: Server;
let baseUrl: string;

function startTestServer(staticRoot?: string) {
  const handler = createUiRequestHandler({ config, staticRoot });
  server = createServer((req, res) => void handler(req, res));
  return new Promise<void>((resolve) => {
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

/**
 * The UI server's outbound calls to Supermemory and the test's own inbound
 * calls to the local test server both go through global.fetch now (ops.ts
 * calls real fetch directly, no SDK layer to mock). This routes requests to
 * config.baseUrl through the given canned responder, and passes everything
 * else (the test's own requests to the local ui server) through to the real
 * fetch untouched.
 */
function mockSupermemoryFetch(
  impl: (url: string, init?: RequestInit) => { ok: boolean; status: number; json?: () => Promise<unknown>; text?: () => Promise<string> },
) {
  const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
    if (typeof url === "string" && url.startsWith(config.baseUrl)) {
      return Promise.resolve(impl(url, init));
    }
    return realFetch(url as string, init);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function supermemoryCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => typeof url === "string" && url.startsWith(config.baseUrl));
}

afterEach(() => {
  server?.close();
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("GET /api/memories", () => {
  it("delegates to ops.listEntriesWithHistory with the tag query param", async () => {
    const fetchMock = mockSupermemoryFetch(() => ({
      ok: true,
      status: 200,
      json: async () => ({ memoryEntries: [{ id: "mem_1" }], pagination: {} }),
    }));
    await startTestServer();

    const res = await realFetch(`${baseUrl}/api/memories?tag=src_github`);
    const body = await res.json();

    expect(res.status).toBe(200);
    const [smCall] = supermemoryCalls(fetchMock);
    expect(smCall[0]).toBe("http://localhost:6767/v4/memories/list");
    expect(JSON.parse((smCall[1] as RequestInit).body as string)).toEqual({ containerTags: ["src_github"] });
    expect(body.memoryEntries).toEqual([{ id: "mem_1" }]);
  });
});

describe("GET /api/review", () => {
  it("returns supported:true with results when the endpoint works", async () => {
    mockSupermemoryFetch(() => ({
      ok: true,
      status: 200,
      json: async () => ({ memories: [{ id: "inf_1" }], total: 1 }),
    }));
    await startTestServer();

    const res = await realFetch(`${baseUrl}/api/review?tag=curator_default`);
    const body = await res.json();

    expect(body.supported).toBe(true);
    expect(body.total).toBe(1);
  });

  it("degrades to supported:false instead of a 500 when the endpoint is unsupported", async () => {
    mockSupermemoryFetch(() => ({ ok: false, status: 404, text: async () => "not found" }));
    await startTestServer();

    const res = await realFetch(`${baseUrl}/api/review?tag=curator_default`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ supported: false, memories: [], total: 0 });
  });
});

describe("POST /api/forget", () => {
  it("defaults dryRun to true and never calls the forget endpoint for mode:'id'", async () => {
    const fetchMock = mockSupermemoryFetch(() => ({ ok: true, status: 200, json: async () => ({}) }));
    await startTestServer();

    const res = await realFetch(`${baseUrl}/api/forget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "mem_1", mode: "id" }),
    });
    const body = await res.json();

    expect(supermemoryCalls(fetchMock)).toHaveLength(0);
    expect(body.dryRun).toBe(true);
  });

  it("calls DELETE /v4/memories only when dryRun is explicitly false", async () => {
    const fetchMock = mockSupermemoryFetch(() => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "mem_1", forgotten: true }),
    }));
    await startTestServer();

    const res = await realFetch(`${baseUrl}/api/forget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "mem_1", mode: "id", dryRun: false }),
    });
    const body = await res.json();

    const [smCall] = supermemoryCalls(fetchMock);
    expect(smCall[0]).toBe("http://localhost:6767/v4/memories");
    expect((smCall[1] as RequestInit).method).toBe("DELETE");
    expect(body.forgotten).toBe(true);
  });
});

describe("POST /api/review/:id", () => {
  it("rejects an invalid action with 400", async () => {
    mockSupermemoryFetch(() => ({ ok: true, status: 200, json: async () => ({}) }));
    await startTestServer();

    const res = await realFetch(`${baseUrl}/api/review/inf_1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "yolo" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("unknown routes", () => {
  it("returns 404", async () => {
    await startTestServer();
    const res = await realFetch(`${baseUrl}/api/nonexistent`);
    expect(res.status).toBe(404);
  });
});

describe("static SPA serving", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serves an existing asset with the right content-type", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-ui-static-"));
    writeFileSync(join(tmpDir, "index.html"), "<html><body>curator</body></html>");
    mkdirSync(join(tmpDir, "assets"));
    writeFileSync(join(tmpDir, "assets", "index.js"), "console.log('hi')");

    await startTestServer(tmpDir);
    const res = await realFetch(`${baseUrl}/assets/index.js`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(await res.text()).toBe("console.log('hi')");
  });

  it("falls back to index.html for an unrecognized client-side route", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-ui-static-"));
    writeFileSync(join(tmpDir, "index.html"), "<html><body>curator</body></html>");

    await startTestServer(tmpDir);
    const res = await realFetch(`${baseUrl}/some/client/route`);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("curator");
  });

  it("returns 404 when the SPA hasn't been built and no fallback exists", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-ui-static-empty-"));

    await startTestServer(tmpDir);
    const res = await realFetch(`${baseUrl}/`);

    expect(res.status).toBe(404);
  });
});
