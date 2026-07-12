import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Supermemory from "supermemory";
import { syncGithubRaw } from "../src/sync/raw.js";
import { getCursor } from "../src/state.js";
import type { CuratorConfig } from "../src/config.js";
import type { GithubIssueRow } from "../src/sync/mapping.js";

const fixturePath = fileURLToPath(new URL("./fixtures/coral-github.json", import.meta.url));
const fixtureRows: GithubIssueRow[] = JSON.parse(readFileSync(fixturePath, "utf8"));

const config: CuratorConfig = { apiKey: "sm_test_key", baseUrl: "http://localhost:6767" };

function fakeClient(add: ReturnType<typeof vi.fn>): Supermemory {
  return { documents: { add } } as unknown as Supermemory;
}

describe("syncGithubRaw", () => {
  let tmpDir: string;
  let statePath: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  function freshStatePath(): string {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-raw-sync-"));
    return join(tmpDir, "state.json");
  }

  it("stores every fetched row and advances the cursor to the max updated_at", async () => {
    statePath = freshStatePath();
    const add = vi.fn().mockResolvedValue({ id: "doc_1", status: "queued" });
    const client = fakeClient(add);
    const fetchRows = vi.fn().mockResolvedValue(fixtureRows);

    const result = await syncGithubRaw({
      owner: "example",
      repo: "repo",
      statePath,
      config,
      client,
      fetchRows,
    });

    expect(result.stored).toBe(2);
    expect(result.newCursor).toBe("2026-07-11T09:30:00Z");
    expect(add).toHaveBeenCalledTimes(2);
    expect(getCursor("github", statePath)).toBe("2026-07-11T09:30:00Z");
  });

  it("passes the cursor into the Coral SQL query on the second run", async () => {
    statePath = freshStatePath();
    const add = vi.fn().mockResolvedValue({ id: "doc_1", status: "queued" });
    const client = fakeClient(add);
    const fetchRows = vi.fn().mockResolvedValue(fixtureRows);

    await syncGithubRaw({ owner: "example", repo: "repo", statePath, config, client, fetchRows });
    fetchRows.mockClear();
    add.mockClear();

    // Second run: no new rows from Coral (simulating nothing changed since cursor).
    fetchRows.mockResolvedValue([]);
    const secondResult = await syncGithubRaw({
      owner: "example",
      repo: "repo",
      statePath,
      config,
      client,
      fetchRows,
    });

    const queryArg = fetchRows.mock.calls[0][0] as string;
    expect(queryArg).toContain("2026-07-11T09:30:00Z");
    expect(secondResult.stored).toBe(0);
    expect(add).not.toHaveBeenCalled();
    // Idempotent: cursor unchanged when there are no new rows.
    expect(getCursor("github", statePath)).toBe("2026-07-11T09:30:00Z");
  });

  it("uses the customId from mapping so re-ingesting the same row is update-in-place, not a duplicate", async () => {
    statePath = freshStatePath();
    const add = vi.fn().mockResolvedValue({ id: "doc_1", status: "queued" });
    const client = fakeClient(add);
    const fetchRows = vi.fn().mockResolvedValue([fixtureRows[0]]);

    await syncGithubRaw({ owner: "example", repo: "repo", statePath, config, client, fetchRows });

    expect(add).toHaveBeenCalledWith(expect.objectContaining({ customId: "github:issue:41" }));
  });
});
