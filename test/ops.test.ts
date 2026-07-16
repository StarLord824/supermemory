import { afterEach, describe, expect, it, vi } from "vitest";
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
  sanitizeCustomId,
} from "../src/supermemory/ops.js";
import type { CuratorConfig } from "../src/config.js";

const config: CuratorConfig = { apiKey: "sm_test_key", baseUrl: "http://localhost:6767" };

function mockFetchOnce(response: { ok: boolean; status: number; json?: () => Promise<unknown>; text?: () => Promise<string> }) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("ops (all calls go through rawRequest against confirmed live paths)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("remember", () => {
    it("POSTs to /v3/documents, defaulting containerTag", async () => {
      const fetchMock = mockFetchOnce({ ok: true, status: 200, json: async () => ({ id: "doc_1", status: "queued" }) });

      const result = await remember(config, { content: "hello world" });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:6767/v3/documents");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual(
        expect.objectContaining({ content: "hello world", containerTag: "curator_default" }),
      );
      expect(result).toEqual({ id: "doc_1", status: "queued" });
    });

    it("passes through an explicit containerTag and customId", async () => {
      const fetchMock = mockFetchOnce({ ok: true, status: 200, json: async () => ({ id: "doc_2", status: "done" }) });

      await remember(config, { content: "x", containerTag: "src_github", customId: "github:issue:42" });

      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual(
        expect.objectContaining({ containerTag: "src_github", customId: "github:issue:42" }),
      );
    });

    it("sanitizes a customId containing characters Supermemory rejects (confirmed live: / and # 400)", async () => {
      const fetchMock = mockFetchOnce({ ok: true, status: 200, json: async () => ({ id: "doc_3", status: "queued" }) });

      await remember(config, {
        content: "x",
        customId: "github:pr:medullabs-code/Medullabs#188",
      });

      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body).customId).toBe("github:pr:medullabs-code-Medullabs-188");
    });
  });

  describe("sanitizeCustomId", () => {
    it("replaces slashes and hashes with hyphens", () => {
      expect(sanitizeCustomId("github:pr:owner/repo#42")).toBe("github:pr:owner-repo-42");
    });

    it("leaves already-valid customIds untouched", () => {
      expect(sanitizeCustomId("github:issue:41")).toBe("github:issue:41");
    });
  });

  describe("recall", () => {
    it("POSTs the query as `q` to /v4/search (confirmed memory-search endpoint)", async () => {
      const fetchMock = mockFetchOnce({ ok: true, status: 200, json: async () => ({ results: [], total: 0, timing: 1 }) });

      await recall(config, { query: "hackathon deadline", containerTag: "curator_default" });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:6767/v4/search");
      expect(JSON.parse(init.body)).toEqual(
        expect.objectContaining({ q: "hackathon deadline", containerTag: "curator_default" }),
      );
    });
  });

  describe("forgetById", () => {
    it("DELETEs /v4/memories with id, containerTag, and reason", async () => {
      const fetchMock = mockFetchOnce({ ok: true, status: 200, json: async () => ({ id: "mem_1", forgotten: true }) });

      const result = await forgetById(config, { id: "mem_1", containerTag: "curator_default" });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:6767/v4/memories");
      expect(init.method).toBe("DELETE");
      expect(JSON.parse(init.body)).toEqual(
        expect.objectContaining({ id: "mem_1", containerTag: "curator_default" }),
      );
      expect(result.forgotten).toBe(true);
    });
  });

  describe("listEntriesWithHistory", () => {
    it("POSTs containerTags to /v4/memories/list and returns the memoryEntries field", async () => {
      const fetchMock = mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({ memoryEntries: [{ id: "mem_1" }], pagination: { currentPage: 1, totalItems: 1, totalPages: 1 } }),
      });

      const result = await listEntriesWithHistory(config, ["src_github"]);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:6767/v4/memories/list");
      expect(JSON.parse(init.body)).toEqual({ containerTags: ["src_github"] });
      expect(result.memoryEntries).toEqual([{ id: "mem_1" }]);
    });
  });

  describe("getProfile", () => {
    it("POSTs to /v4/profile with the container tag", async () => {
      const fetchMock = mockFetchOnce({ ok: true, status: 200, json: async () => ({ profile: { static: [], dynamic: [], buckets: {} } }) });

      await getProfile(config, "curator_default");

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:6767/v4/profile");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({ containerTag: "curator_default" });
    });
  });

  describe("forgetByPrompt", () => {
    it("defaults dryRun to true even when the caller omits it", async () => {
      const fetchMock = mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({ dryRun: true, count: 0, forgetBatchId: null, summary: "", candidates: [] }),
      });

      await forgetByPrompt(config, { query: "everything about X", containerTag: "curator_default" });

      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body).dryRun).toBe(true);
    });

    it("only sends dryRun:false when explicitly requested", async () => {
      const fetchMock = mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({ dryRun: false, count: 0, forgetBatchId: "b1", summary: "", forgotten: [] }),
      });

      await forgetByPrompt(config, {
        query: "everything about X",
        containerTag: "curator_default",
        dryRun: false,
      });

      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body).dryRun).toBe(false);
    });
  });

  describe("listInferred / reviewInferred (confirmed absent on Local, still exercised for error path)", () => {
    it("listInferred GETs the container-tag inferred endpoint", async () => {
      const fetchMock = mockFetchOnce({ ok: true, status: 200, json: async () => ({ memories: [], total: 0 }) });

      await listInferred(config, "curator_default");

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:6767/v3/container-tags/curator_default/inferred");
      expect(init.method).toBe("GET");
    });

    it("reviewInferred POSTs the action to the review endpoint", async () => {
      const fetchMock = mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "mem_1", isInference: false, isForgotten: false, reviewStatus: "approved" }),
      });

      await reviewInferred(config, "curator_default", "mem_1", "approve");

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:6767/v3/container-tags/curator_default/inferred/mem_1/review");
      expect(JSON.parse(init.body)).toEqual({ action: "approve" });
    });
  });

  it("throws an actionable error on a non-ok response", async () => {
    mockFetchOnce({ ok: false, status: 500, text: async () => "internal error" });

    await expect(getProfile(config)).rejects.toThrow(/500/);
  });

  describe("checkHealth", () => {
    it("reports reachable on a 200 from the root path (no dedicated /health on Local)", async () => {
      const fetchMock = mockFetchOnce({ ok: true, status: 200 });

      const health = await checkHealth(config);

      expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:6767");
      expect(health.reachable).toBe(true);
    });

    it("reports unreachable (without throwing) on connection failure", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

      const health = await checkHealth(config);

      expect(health.reachable).toBe(false);
      expect(health.detail).toContain("ECONNREFUSED");
    });

    it("reports unreachable on a non-ok status", async () => {
      mockFetchOnce({ ok: false, status: 404 });

      const health = await checkHealth(config);

      expect(health.reachable).toBe(false);
      expect(health.detail).toContain("404");
    });
  });
});
