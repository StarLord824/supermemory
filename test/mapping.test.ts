import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapGithubIssueRow, type GithubIssueRow } from "../src/sync/mapping.js";

const fixturePath = fileURLToPath(new URL("./fixtures/coral-github.json", import.meta.url));
const fixtureRows: GithubIssueRow[] = JSON.parse(readFileSync(fixturePath, "utf8"));

describe("mapGithubIssueRow", () => {
  it("builds a deterministic customId and containerTag", () => {
    const mapped = mapGithubIssueRow(fixtureRows[0]);
    expect(mapped.customId).toBe("github:issue:41");
    expect(mapped.containerTag).toBe("src_github");
  });

  it("includes issue number, title, state, body, and url in content", () => {
    const mapped = mapGithubIssueRow(fixtureRows[0]);
    expect(mapped.content).toContain("#41");
    expect(mapped.content).toContain("Fix flaky sync test");
    expect(mapped.content).toContain("open");
    expect(mapped.content).toContain("idempotency test occasionally fails");
    expect(mapped.content).toContain("https://github.com/example/repo/issues/41");
  });

  it("handles a null body without crashing", () => {
    const mapped = mapGithubIssueRow(fixtureRows[1]);
    expect(mapped.content).toContain("#42");
    expect(mapped.customId).toBe("github:issue:42");
  });

  it("truncates bodies longer than 2000 characters", () => {
    const longBody = "x".repeat(5000);
    const mapped = mapGithubIssueRow({ ...fixtureRows[0], body: longBody });
    const bodyLine = mapped.content.split("\n")[1];
    expect(bodyLine.length).toBe(2000);
  });

  it("carries source/type/url/updatedAt in metadata", () => {
    const mapped = mapGithubIssueRow(fixtureRows[1]);
    expect(mapped.metadata).toEqual({
      source: "github",
      type: "issue",
      url: "https://github.com/example/repo/issues/42",
      updatedAt: "2026-07-11T09:30:00Z",
    });
  });
});
