import { afterEach, describe, expect, it, vi } from "vitest";
import type Supermemory from "supermemory";
import {
  checkHealth,
  forgetById,
  forgetByPrompt,
  getProfile,
  listEntriesWithHistory,
  listInferred,
  recall,
  remember,
  reviewInferred,
} from "../src/supermemory/ops.js";
import type { CuratorConfig } from "../src/config.js";

const config: CuratorConfig = { apiKey: "sm_test_key", baseUrl: "http://localhost:6767" };

function fakeClient(overrides: Record<string, unknown>): Supermemory {
  return overrides as unknown as Supermemory;
}

describe("remember", () => {
  it("defaults containerTag and forwards fields to client.documents.add", async () => {
    const add = vi.fn().mockResolvedValue({ id: "doc_1", status: "queued" });
    const client = fakeClient({ documents: { add } });

    const result = await remember(client, { content: "hello world" });

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ content: "hello world", containerTag: "curator_default" }),
    );
    expect(result).toEqual({ id: "doc_1", status: "queued" });
  });

  it("passes through an explicit containerTag and customId", async () => {
    const add = vi.fn().mockResolvedValue({ id: "doc_2", status: "done" });
    const client = fakeClient({ documents: { add } });

    await remember(client, { content: "x", containerTag: "src_github", customId: "github:issue:42" });

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ containerTag: "src_github", customId: "github:issue:42" }),
    );
  });
});

describe("recall", () => {
  it("sends the query as `q` to client.search.memories", async () => {
    const memories = vi.fn().mockResolvedValue({ results: [], total: 0 });
    const client = fakeClient({ search: { memories } });

    await recall(client, { query: "hackathon deadline", containerTag: "curator_default" });

    expect(memories).toHaveBeenCalledWith(
      expect.objectContaining({ q: "hackathon deadline", containerTag: "curator_default" }),
    );
  });
});

describe("forgetById", () => {
  it("forwards id, containerTag, and reason to client.memories.forget", async () => {
    const forget = vi.fn().mockResolvedValue({ id: "mem_1", forgotten: true });
    const client = fakeClient({ memories: { forget } });

    const result = await forgetById(client, { id: "mem_1", containerTag: "curator_default" });

    expect(forget).toHaveBeenCalledWith(
      expect.objectContaining({ id: "mem_1", containerTag: "curator_default" }),
    );
    expect(result.forgotten).toBe(true);
  });
});

describe("listEntriesWithHistory", () => {
  it("passes containerTags through to client.memories.list", async () => {
    const list = vi.fn().mockResolvedValue({ memories: [], pagination: {} });
    const client = fakeClient({ memories: { list } });

    await listEntriesWithHistory(client, ["src_github"]);

    expect(list).toHaveBeenCalledWith({ containerTags: ["src_github"] });
  });
});

describe("raw-fetch ops (profile, forget-matching, review)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("getProfile POSTs to /v4/profile with the container tag", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ facts: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await getProfile(config, "curator_default");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:6767/v4/profile");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ containerTag: "curator_default" });
  });

  it("forgetByPrompt defaults dryRun to true even when the caller omits it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ dryRun: true, count: 0, forgetBatchId: null, summary: "", candidates: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await forgetByPrompt(config, { query: "everything about X", containerTag: "curator_default" });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).dryRun).toBe(true);
  });

  it("forgetByPrompt only sends dryRun:false when explicitly requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ dryRun: false, count: 0, forgetBatchId: "b1", summary: "", candidates: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await forgetByPrompt(config, {
      query: "everything about X",
      containerTag: "curator_default",
      dryRun: false,
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).dryRun).toBe(false);
  });

  it("listInferred GETs the container-tag inferred endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ memories: [], total: 0 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await listInferred(config, "curator_default");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:6767/v3/container-tags/curator_default/inferred");
    expect(init.method).toBe("GET");
  });

  it("reviewInferred POSTs the action to the review endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "mem_1", isInference: false, isForgotten: false, reviewStatus: "approved" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await reviewInferred(config, "curator_default", "mem_1", "approve");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:6767/v3/container-tags/curator_default/inferred/mem_1/review");
    expect(JSON.parse(init.body)).toEqual({ action: "approve" });
  });

  it("throws an actionable error on a non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "internal error",
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(getProfile(config)).rejects.toThrow(/500/);
  });

  it("checkHealth reports reachable on a 200 from /health", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"status":"ok"}',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const health = await checkHealth(config);

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:6767/health");
    expect(health.reachable).toBe(true);
    expect(health.detail).toContain("ok");
  });

  it("checkHealth reports unreachable (without throwing) on connection failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    const health = await checkHealth(config);

    expect(health.reachable).toBe(false);
    expect(health.detail).toContain("ECONNREFUSED");
  });

  it("checkHealth reports unreachable on a non-ok status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "not found",
    }) as unknown as typeof fetch;

    const health = await checkHealth(config);

    expect(health.reachable).toBe(false);
    expect(health.detail).toContain("404");
  });
});
