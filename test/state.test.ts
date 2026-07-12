import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getCursor, readState, setCursor, writeState } from "../src/state.js";

describe("state", () => {
  let tmpDir: string;
  let statePath: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  function freshStatePath(): string {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-state-"));
    return join(tmpDir, "nested", "state.json");
  }

  it("returns empty defaults when no state file exists", () => {
    statePath = freshStatePath();
    expect(readState(statePath)).toEqual({ cursors: {}, settings: {} });
  });

  it("round-trips a written state, creating parent dirs", () => {
    statePath = freshStatePath();
    writeState({ cursors: { github: "2026-01-01T00:00:00Z" }, settings: { foo: "bar" } }, statePath);

    expect(readState(statePath)).toEqual({
      cursors: { github: "2026-01-01T00:00:00Z" },
      settings: { foo: "bar" },
    });
  });

  it("setCursor updates only the given source and preserves others", () => {
    statePath = freshStatePath();
    setCursor("github", "2026-01-01T00:00:00Z", statePath);
    setCursor("linear", "2026-02-02T00:00:00Z", statePath);

    expect(getCursor("github", statePath)).toBe("2026-01-01T00:00:00Z");
    expect(getCursor("linear", statePath)).toBe("2026-02-02T00:00:00Z");
    expect(getCursor("slack", statePath)).toBeUndefined();
  });
});
