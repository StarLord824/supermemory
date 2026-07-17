import { describe, expect, it } from "vitest";
import { buildGraphDocuments } from "../src/ui/graph.js";
import type { DocumentRecord, MemoryEntryWithHistory } from "../src/supermemory/ops.js";

function doc(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "doc_1",
    title: "PR #171",
    summary: "Made the logo optional",
    status: "done",
    type: "text",
    createdAt: "2026-07-16T12:00:00Z",
    updatedAt: "2026-07-16T12:00:00Z",
    ...overrides,
  };
}

function entry(overrides: Partial<MemoryEntryWithHistory> = {}): MemoryEntryWithHistory {
  return {
    id: "mem_1",
    memory: "PR #171 made the logo optional.",
    version: 1,
    isLatest: true,
    isForgotten: false,
    isStatic: false,
    isInference: false,
    createdAt: "2026-07-16T12:00:00Z",
    updatedAt: "2026-07-16T12:00:00Z",
    spaceId: "space_1",
    orgId: "org_1",
    sourceCount: 1,
    parentMemoryId: null,
    rootMemoryId: "mem_1",
    forgetAfter: null,
    forgetReason: null,
    metadata: null,
    memoryRelations: null,
    temporalContext: null,
    history: [],
    documentIds: ["doc_1"],
    ...overrides,
  };
}

describe("buildGraphDocuments", () => {
  it("groups memories under their source document and maps type -> documentType", () => {
    const result = buildGraphDocuments([doc()], [entry()]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "doc_1",
      title: "PR #171",
      summary: "Made the logo optional",
      documentType: "text",
    });
    expect(result[0].memories).toHaveLength(1);
    expect(result[0].memories[0]).toMatchObject({
      id: "mem_1",
      memory: "PR #171 made the logo optional.",
      spaceId: "space_1",
      isLatest: true,
      isForgotten: false,
      isStatic: false,
      version: 1,
      rootMemoryId: "mem_1",
    });
  });

  it("groups multiple memories under the same document", () => {
    const result = buildGraphDocuments(
      [doc()],
      [entry({ id: "mem_1" }), entry({ id: "mem_2", memory: "second" })],
    );

    expect(result).toHaveLength(1);
    expect(result[0].memories.map((m) => m.id)).toEqual(["mem_1", "mem_2"]);
  });

  it("buckets memories with no matching document into a synthetic Ungrouped document rather than dropping them", () => {
    const result = buildGraphDocuments([doc()], [entry({ id: "orphan", documentIds: ["doc_missing"] })]);

    const ungrouped = result.find((d) => d.id === "ungrouped");
    expect(ungrouped).toBeDefined();
    expect(ungrouped!.title).toBe("Other memories");
    expect(ungrouped!.memories.map((m) => m.id)).toEqual(["orphan"]);
  });

  it("buckets memories with an empty documentIds array into Ungrouped too", () => {
    const result = buildGraphDocuments([doc()], [entry({ id: "orphan", documentIds: [] })]);

    expect(result.find((d) => d.id === "ungrouped")!.memories).toHaveLength(1);
  });

  it("omits documents that have no memories (no empty nodes in the graph)", () => {
    const result = buildGraphDocuments([doc({ id: "doc_1" }), doc({ id: "doc_empty" })], [entry()]);

    expect(result.map((d) => d.id)).toEqual(["doc_1"]);
  });

  it("omits the Ungrouped bucket entirely when every memory has a document", () => {
    const result = buildGraphDocuments([doc()], [entry()]);

    expect(result.find((d) => d.id === "ungrouped")).toBeUndefined();
  });

  it("passes memoryRelations through so the graph can draw version-chain edges", () => {
    const relations = { mem_2: "updates" as const };
    const result = buildGraphDocuments([doc()], [entry({ memoryRelations: relations })]);

    expect(result[0].memories[0].memoryRelations).toEqual(relations);
  });
});
