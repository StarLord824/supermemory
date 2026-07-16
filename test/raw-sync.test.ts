import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { syncGithubRaw } from "../src/sync/raw.js";
import { getCursor } from "../src/state.js";
import type { CuratorConfig } from "../src/config.js";
import type { GithubIssueRow } from "../src/sync/mapping.js";

const fixturePath = fileURLToPath(new URL("./fixtures/coral-github.json", import.meta.url));
const fixtureRows: GithubIssueRow[] = JSON.parse(readFileSync(fixturePath, "utf8"));

const config: CuratorConfig = { apiKey: "sm_test_key", baseUrl: "http://localhost:6767" };

describe("syncGithubRaw", () => {
  let tmpDir: string;
  let statePath: string;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    global.fetch = originalFetch;
  });

  function freshStatePath(): string {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-raw-sync-"));
    return join(tmpDir, "state.json");
  }

  function mockRemember() {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "doc_1", status: "queued" }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it("stores every fetched row and advances the cursor to the max updated_at", async () => {
    statePath = freshStatePath();
    const fetchMock = mockRemember();
    const fetchRows = vi.fn().mockResolvedValue(fixtureRows);

    const result = await syncGithubRaw({
      owner: "example",
      repo: "repo",
      statePath,
      config,
      fetchRows,
    });

    expect(result.stored).toBe(2);
    expect(result.newCursor).toBe("2026-07-11T09:30:00Z");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getCursor("github", statePath)).toBe("2026-07-11T09:30:00Z");
  });

  it("passes the cursor into the Coral SQL query on the second run", async () => {
    statePath = freshStatePath();
    mockRemember();
    const fetchRows = vi.fn().mockResolvedValue(fixtureRows);

    await syncGithubRaw({ owner: "example", repo: "repo", statePath, config, fetchRows });
    fetchRows.mockClear();
    const fetchMock = mockRemember();

    // Second run: no new rows from Coral (simulating nothing changed since cursor).
    fetchRows.mockResolvedValue([]);
    const secondResult = await syncGithubRaw({
      owner: "example",
      repo: "repo",
      statePath,
      config,
      fetchRows,
    });

    const queryArg = fetchRows.mock.calls[0][0] as string;
    expect(queryArg).toContain("2026-07-11T09:30:00Z");
    expect(secondResult.stored).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    // Idempotent: cursor unchanged when there are no new rows.
    expect(getCursor("github", statePath)).toBe("2026-07-11T09:30:00Z");
  });

  it("uses the customId from mapping so re-ingesting the same row is update-in-place, not a duplicate", async () => {
    statePath = freshStatePath();
    const fetchMock = mockRemember();
    const fetchRows = vi.fn().mockResolvedValue([fixtureRows[0]]);

    await syncGithubRaw({ owner: "example", repo: "repo", statePath, config, fetchRows });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual(expect.objectContaining({ customId: "github:issue:41" }));
  });
});
