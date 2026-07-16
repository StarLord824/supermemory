import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "../src/mcp/server.js";
import { readStaged } from "../src/sync/staging.js";
import type { CuratorConfig } from "../src/config.js";

const config: CuratorConfig = { apiKey: "sm_test_key", baseUrl: "http://localhost:6767" };

async function connectedClient() {
  const server = createMcpServer(config);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function mockFetchOnce(response: { ok: boolean; status: number; json?: () => Promise<unknown>; text?: () => Promise<string> }) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("MCP server", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("exposes exactly 4 tools: remember, recall, forget, get_profile", async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["forget", "get_profile", "recall", "remember"]);
  });

  it("remember stores content via ops.remember (POST /v3/documents)", async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: async () => ({ id: "doc_1", status: "queued" }) });
    const client = await connectedClient();

    const result = await client.callTool({
      name: "remember",
      arguments: { content: "hackathon deadline is July 13" },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:6767/v3/documents");
    expect(JSON.parse(init.body)).toEqual(expect.objectContaining({ content: "hackathon deadline is July 13" }));
    expect(result.isError).toBeFalsy();
  });

  describe("remember in review/stage mode", () => {
    let tmpDir: string;
    let stageFile: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "curator-mcp-stage-"));
      stageFile = join(tmpDir, "staged.jsonl");
      process.env.CURATOR_REMEMBER_MODE = "stage";
      process.env.CURATOR_STAGE_FILE = stageFile;
    });

    afterEach(() => {
      delete process.env.CURATOR_REMEMBER_MODE;
      delete process.env.CURATOR_STAGE_FILE;
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it("stages the proposal to the stage file instead of calling ops.remember", async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      const client = await connectedClient();

      const result = await client.callTool({
        name: "remember",
        arguments: { content: "PR #42 merged", customId: "github:pull:42", containerTag: "src_github" },
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.isError).toBeFalsy();

      const staged = readStaged(stageFile);
      expect(staged).toHaveLength(1);
      expect(staged[0]).toMatchObject({
        content: "PR #42 merged",
        customId: "github:pull:42",
        containerTag: "src_github",
      });
    });
  });

  it("forget defaults dryRun to true and does not call the forget endpoint for mode:'id'", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = await connectedClient();

    const result = await client.callTool({
      name: "forget",
      arguments: { target: "mem_1", mode: "id" },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.isError).toBeFalsy();
  });

  it("forget calls DELETE /v4/memories only when dryRun is explicitly false", async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: async () => ({ id: "mem_1", forgotten: true }) });
    const client = await connectedClient();

    await client.callTool({
      name: "forget",
      arguments: { target: "mem_1", mode: "id", dryRun: false },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:6767/v4/memories");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual(expect.objectContaining({ id: "mem_1" }));
  });

  it("surfaces a failure as an MCP tool error, not a stack trace", async () => {
    mockFetchOnce({ ok: false, status: 500, text: async () => "internal error" });
    const client = await connectedClient();

    const result = await client.callTool({ name: "remember", arguments: { content: "x" } });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Supermemory request failed");
    expect(text).not.toContain("at ");
  });
});
