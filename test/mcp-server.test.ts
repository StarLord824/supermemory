import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type Supermemory from "supermemory";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "../src/mcp/server.js";
import type { CuratorConfig } from "../src/config.js";

const config: CuratorConfig = { apiKey: "sm_test_key", baseUrl: "http://localhost:6767" };

function fakeClient(overrides: Record<string, unknown>): Supermemory {
  return overrides as unknown as Supermemory;
}

async function connectedClient(smClient: Supermemory) {
  const server = createMcpServer(smClient, config);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe("MCP server", () => {
  it("exposes exactly 4 tools: remember, recall, forget, get_profile", async () => {
    const client = await connectedClient(fakeClient({}));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["forget", "get_profile", "recall", "remember"]);
  });

  it("remember stores content via ops.remember", async () => {
    const add = vi.fn().mockResolvedValue({ id: "doc_1", status: "queued" });
    const client = await connectedClient(fakeClient({ documents: { add } }));

    const result = await client.callTool({
      name: "remember",
      arguments: { content: "hackathon deadline is July 13" },
    });

    expect(add).toHaveBeenCalledWith(expect.objectContaining({ content: "hackathon deadline is July 13" }));
    expect(result.isError).toBeFalsy();
  });

  it("forget defaults dryRun to true and does not call forgetById for mode:'id'", async () => {
    const forget = vi.fn();
    const client = await connectedClient(fakeClient({ memories: { forget } }));

    const result = await client.callTool({
      name: "forget",
      arguments: { target: "mem_1", mode: "id" },
    });

    expect(forget).not.toHaveBeenCalled();
    expect(result.isError).toBeFalsy();
  });

  it("forget calls forgetById only when dryRun is explicitly false", async () => {
    const forget = vi.fn().mockResolvedValue({ id: "mem_1", forgotten: true });
    const client = await connectedClient(fakeClient({ memories: { forget } }));

    await client.callTool({
      name: "forget",
      arguments: { target: "mem_1", mode: "id", dryRun: false },
    });

    expect(forget).toHaveBeenCalledWith(expect.objectContaining({ id: "mem_1" }));
  });

  it("surfaces a failure as an MCP tool error, not a stack trace", async () => {
    const add = vi.fn().mockRejectedValue(new Error("Supermemory request failed: 500"));
    const client = await connectedClient(fakeClient({ documents: { add } }));

    const result = await client.callTool({ name: "remember", arguments: { content: "x" } });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Supermemory request failed");
    expect(text).not.toContain("at ");
  });
});
