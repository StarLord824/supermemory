import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearStaged, readStaged, stageMemory } from "../src/sync/staging.js";

describe("staging", () => {
  let tmpDir: string;
  let stageFile: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  function freshStageFile(): string {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-staging-"));
    return join(tmpDir, "nested", "staged.jsonl");
  }

  it("appends staged memories as JSONL and reads them back", () => {
    stageFile = freshStageFile();
    stageMemory({ content: "a", customId: "github:issue:1", containerTag: "src_github" }, stageFile);
    stageMemory({ content: "b", customId: "github:issue:2" }, stageFile);

    const staged = readStaged(stageFile);
    expect(staged).toHaveLength(2);
    expect(staged[0]).toMatchObject({ content: "a", customId: "github:issue:1", containerTag: "src_github" });
    expect(staged[0].stagedAt).toBeTypeOf("string");
    expect(staged[1].content).toBe("b");
  });

  it("returns an empty array when no stage file exists", () => {
    stageFile = freshStageFile();
    expect(readStaged(stageFile)).toEqual([]);
  });

  it("clears the stage file", () => {
    stageFile = freshStageFile();
    stageMemory({ content: "a" }, stageFile);
    clearStaged(stageFile);
    expect(readStaged(stageFile)).toEqual([]);
  });

  it("clearStaged is a no-op when the file is already absent", () => {
    stageFile = freshStageFile();
    expect(() => clearStaged(stageFile)).not.toThrow();
  });
});
