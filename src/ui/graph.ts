import type { DocumentRecord, MemoryEntryWithHistory } from "../supermemory/ops.js";

export type MemoryRelation = "updates" | "extends" | "derives";

/**
 * Mirrors @supermemory/memory-graph's own GraphApiMemory (from its
 * dist/types.d.ts) — MemoryGraphProps.documents is GraphApiDocument[]. We
 * redeclare it here rather than importing the React package into Node code.
 */
export interface GraphApiMemory {
  id: string;
  memory: string;
  isStatic: boolean;
  spaceId: string;
  isLatest: boolean;
  isForgotten: boolean;
  forgetAfter: string | null;
  forgetReason: string | null;
  version: number;
  parentMemoryId: string | null;
  rootMemoryId: string | null;
  createdAt: string;
  updatedAt: string;
  memoryRelations?: Record<string, MemoryRelation> | null;
}

export interface GraphApiDocument {
  id: string;
  title: string | null;
  summary: string | null;
  documentType: string;
  createdAt: string;
  updatedAt: string;
  memories: GraphApiMemory[];
}

const UNGROUPED_ID = "ungrouped";

function toGraphMemory(entry: MemoryEntryWithHistory): GraphApiMemory {
  return {
    id: entry.id,
    memory: entry.memory,
    isStatic: entry.isStatic,
    spaceId: entry.spaceId,
    isLatest: entry.isLatest,
    isForgotten: entry.isForgotten,
    forgetAfter: entry.forgetAfter,
    forgetReason: entry.forgetReason,
    version: entry.version,
    parentMemoryId: entry.parentMemoryId,
    rootMemoryId: entry.rootMemoryId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    memoryRelations: entry.memoryRelations,
  };
}

/**
 * Joins documents (/v3/documents/list) with memory entries
 * (/v4/memories/list) into the shape @supermemory/memory-graph expects.
 *
 * Grouping rule: a memory belongs to its FIRST documentIds entry. Memories
 * whose document is missing (or that have no documentIds at all) go into a
 * synthetic "Ungrouped" document rather than being silently dropped —
 * defensive: a memory can reference a document the documents list didn't
 * return. (The containerTags filter is confirmed working — see
 * docs/api-verification.md §14 — so this guard is belt-and-braces.)
 * Documents with no memories are omitted so the graph has no empty nodes.
 */
export function buildGraphDocuments(
  documents: DocumentRecord[],
  entries: MemoryEntryWithHistory[],
): GraphApiDocument[] {
  const byDocId = new Map<string, GraphApiMemory[]>();
  const ungrouped: GraphApiMemory[] = [];

  for (const entry of entries) {
    const docId = entry.documentIds?.[0];
    if (!docId) {
      ungrouped.push(toGraphMemory(entry));
      continue;
    }
    const bucket = byDocId.get(docId);
    if (bucket) bucket.push(toGraphMemory(entry));
    else byDocId.set(docId, [toGraphMemory(entry)]);
  }

  const result: GraphApiDocument[] = [];

  for (const document of documents) {
    const memories = byDocId.get(document.id);
    if (!memories || memories.length === 0) continue;
    byDocId.delete(document.id);
    result.push({
      id: document.id,
      title: document.title,
      summary: document.summary,
      documentType: document.type,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      memories,
    });
  }

  // Any memory whose document wasn't in the documents list.
  for (const orphaned of byDocId.values()) ungrouped.push(...orphaned);

  if (ungrouped.length > 0) {
    const now = new Date(0).toISOString();
    result.push({
      id: UNGROUPED_ID,
      title: "Other memories",
      summary: null,
      documentType: "text",
      createdAt: now,
      updatedAt: now,
      memories: ungrouped,
    });
  }

  return result;
}
