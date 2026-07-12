import { describe, expect, it } from "vitest";
import { buildSyncPrompt, parseCursorFromOutput } from "../src/sync/prompt.js";

describe("buildSyncPrompt", () => {
  it("includes the cursor and sources", () => {
    const prompt = buildSyncPrompt("2026-07-01T00:00:00Z", ["github", "linear"]);
    expect(prompt).toContain("2026-07-01T00:00:00Z");
    expect(prompt).toContain("github, linear");
  });

  it("mandates the customId convention and forbids forget/secrets", () => {
    const prompt = buildSyncPrompt("2026-07-01T00:00:00Z", ["github"]);
    expect(prompt).toContain('customId: "{source}:{type}:{native_id}"');
    expect(prompt).toContain("Do NOT call forget");
    expect(prompt).toContain("Do NOT store secrets, tokens, or emails");
  });

  it("instructs the trailing CURSOR= report line", () => {
    const prompt = buildSyncPrompt("2026-07-01T00:00:00Z", ["github"]);
    expect(prompt).toContain("CURSOR=<iso>");
  });
});

describe("parseCursorFromOutput", () => {
  it("extracts a valid trailing CURSOR= line", () => {
    const output = "scanned 10, stored 3\nCURSOR=2026-07-12T08:00:00Z";
    expect(parseCursorFromOutput(output)).toBe("2026-07-12T08:00:00Z");
  });

  it("returns null when the CURSOR= line is absent", () => {
    expect(parseCursorFromOutput("no cursor here")).toBeNull();
  });

  it("returns null when the CURSOR= value is not a valid date", () => {
    expect(parseCursorFromOutput("CURSOR=not-a-date")).toBeNull();
  });
});
