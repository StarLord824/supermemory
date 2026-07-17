import type { ContainerTagSummary } from "./supermemory/ops.js";

/** Plain-text table for `curator tags`: one row per tag (in the order given), with a document count column. */
export function formatTagsTable(tags: ContainerTagSummary[]): string {
  if (tags.length === 0) {
    return "No container tags found yet — run `curator sync` or `curator connect` to add data.";
  }
  const tagWidth = Math.max(...tags.map((t) => t.tag.length), "TAG".length);
  const header = `${"TAG".padEnd(tagWidth)}  DOCUMENTS`;
  const rows = tags.map((t) => `${t.tag.padEnd(tagWidth)}  ${t.documentCount}`);
  return [header, ...rows].join("\n");
}
