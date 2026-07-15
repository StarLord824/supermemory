import { describe, expect, it } from "vitest";
import { formatSuggestions, getSuggestions, SOURCE_SUGGESTIONS } from "../src/sync/suggestions.js";

describe("getSuggestions", () => {
  it("returns the curated suggestions for a known source", () => {
    const suggestions = getSuggestions(["github"]);
    expect(suggestions).toContain("only merged PRs and the decisions they encode");
  });

  it("merges suggestions across sources without duplicates, capped at the limit", () => {
    const suggestions = getSuggestions(["github", "linear", "slack"], 6);
    expect(suggestions).toHaveLength(6);
    expect(new Set(suggestions).size).toBe(6);
  });

  it("falls back to generic suggestions for unknown sources — never empty", () => {
    const suggestions = getSuggestions(["somethingelse"]);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]).toContain("updated since the last sync");
  });

  it("is case/whitespace tolerant on source names", () => {
    expect(getSuggestions([" GitHub "])).toEqual(getSuggestions(["github"]));
  });

  it("every curated suggestion list is non-empty", () => {
    for (const [source, list] of Object.entries(SOURCE_SUGGESTIONS)) {
      expect(list.length, `${source} suggestions`).toBeGreaterThan(0);
    }
  });
});

describe("formatSuggestions", () => {
  it("mentions --instruction and lists each suggestion", () => {
    const text = formatSuggestions(["github"], false);
    expect(text).toContain("--instruction");
    expect(text).toContain("only merged PRs");
  });

  it("wraps in dim ANSI codes when color is on, plain text when off", () => {
    expect(formatSuggestions(["github"], true)).toMatch(/^\x1b\[2m/);
    expect(formatSuggestions(["github"], false)).not.toContain("\x1b");
  });
});
