import { describe, expect, it } from "vitest";
import { formatTagsTable } from "../src/cli-format.js";

describe("formatTagsTable", () => {
  it("prints a header and one row per tag, column-aligned", () => {
    const table = formatTagsTable([
      { tag: "src_github", documentCount: 12 },
      { tag: "curator_default", documentCount: 3 },
    ]);
    const lines = table.split("\n");
    expect(lines[0]).toBe("TAG              DOCUMENTS");
    expect(lines[1]).toBe("src_github       12");
    expect(lines[2]).toBe("curator_default  3");
  });

  it("prints a helpful message when there are no tags yet", () => {
    expect(formatTagsTable([])).toContain("curator sync");
  });
});
