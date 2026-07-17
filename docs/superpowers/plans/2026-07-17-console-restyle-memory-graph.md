# Console Restyle + Memory Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Curator's governance console to visually match Supermemory's hosted dashboard (dark, card-based, tabbed) and add a real Memory Graph tab powered by the official `@supermemory/memory-graph` component fed by real document + memory data.

**Architecture:** Tailwind CSS (build-time only) provides the visual system. `App.tsx` becomes a tab shell (Memories / Review / Forget / Graph) instead of a scrolling page. A new `ops.listDocuments()` calls the confirmed `POST /v3/documents/list`; a new `GET /api/graph` route joins documents with memory entries (via each memory's `documentIds[0]`) and shapes them into the component's `GraphApiDocument[]` contract. All Supermemory HTTP stays confined to `src/supermemory/ops.ts` per the project's isolation boundary.

**Tech Stack:** TypeScript (Node 20+, ESM), React 18, Vite 6, Tailwind CSS 3, `@supermemory/memory-graph@0.2.3`, `@fontsource` (self-hosted fonts), vitest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-17-console-restyle-memory-graph-design.md`.
- **Isolation boundary:** every Supermemory HTTP call lives in `src/supermemory/ops.ts` only. No other file may name a Supermemory endpoint path. Each new ops function carries a `// SOURCE: ... — CONFIRMED/UNVERIFIED` comment.
- **Verify, don't assume:** do not invent endpoint shapes. Confirmed shapes are quoted in the tasks below. Anything unverified must be labelled UNVERIFIED in code comments and `docs/api-verification.md`.
- **Fonts self-hosted** via `@fontsource` packages — never a Google Fonts CDN `<link>`. The console must work fully offline (project positioning: "everything stays on the machine").
- **Commit style:** conventional commits (`feat:`, `fix:`, `docs:`, `chore:`), small and frequent. Never squash.
- **Test commands:** `pnpm test` (all), `pnpm vitest run test/<name>.test.ts` (one). Typecheck: `npx tsc --noEmit -p tsconfig.json` (backend) and `npx tsc --noEmit -p src/ui/app/tsconfig.json` (frontend). Build: `pnpm build` && `pnpm run build:ui`.
- **Confirmed API shapes (from the live server's own `/v4/openapi`, 2026-07-16/17):**
  - `POST /v4/memories/list` req `{containerTags: string[]}` → res `{memoryEntries: MemoryEntryWithHistory[], pagination}`
  - `POST /v3/documents/list` req `{containerTags?: string[], limit?, page?, sort?, order?}` → res `{memories: DocumentRecord[], pagination}` — **note the response key is literally `memories` even though these are documents. Confirmed, not a typo.**
- **Do not touch:** MCP tools, sync flows, CLI commands, or any already-verified endpoint behavior. This is a console-frontend + one-new-read-endpoint change only.

---

## File Structure

**Create:**
- `src/ui/app/tailwind.config.js` — Tailwind tokens (colors, fonts, radii) extracted from reference screenshots.
- `src/ui/app/postcss.config.js` — PostCSS wiring for Tailwind.
- `src/ui/app/src/index.css` — Tailwind directives + `@fontsource` imports + base body styles.
- `src/ui/app/src/components/ui.tsx` — shared visual primitives (`Card`, `Badge`, `TabBar`) used by every tab.
- `src/ui/app/src/components/GraphView.tsx` — Graph tab: fetches `/api/graph`, renders `<MemoryGraph>`.
- `src/ui/app/src/fixtures/graph.json` — fixture matching `GraphApiDocument[]` for the GraphView render test.
- `test/graph-shape.test.ts` — unit tests for the pure document/memory joining logic.

**Modify:**
- `package.json` — add deps (`@supermemory/memory-graph`, `@fontsource/*`) + devDeps (`tailwindcss`, `postcss`, `autoprefixer`).
- `src/supermemory/ops.ts` — add `DocumentRecord` type + `listDocuments()`.
- `src/ui/graph.ts` *(new file, backend)* — pure `buildGraphDocuments()` join/shape logic (kept out of `server.ts` so it's unit-testable without HTTP).
- `src/ui/server.ts` — add `GET /api/graph` route.
- `src/ui/app/src/main.tsx` — import `./index.css`.
- `src/ui/app/src/api.ts` — add `GraphResponse` type + `fetchGraph()`.
- `src/ui/app/src/App.tsx` — tab shell.
- `src/ui/app/src/components/MemoryBrowser.tsx`, `ForgetConsole.tsx`, `ReviewQueue.tsx` — restyle only.
- `test/ops.test.ts`, `test/ui-server.test.ts`, `test/ui-components.test.tsx` — extend/update.
- `docs/api-verification.md`, `docs/usage.md`, `docs/progress.md` — record findings.

---

### Task 1: `ops.listDocuments()` — the one new endpoint

**Files:**
- Modify: `src/supermemory/ops.ts` (append after `listEntriesWithHistory`)
- Test: `test/ops.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: `rawRequest` from `./client.js`, `CuratorConfig` from `../config.js` (both already imported at the top of `ops.ts`).
- Produces: `export interface DocumentRecord`, `export interface ListDocumentsResult`, `export async function listDocuments(config: CuratorConfig, containerTag: string): Promise<ListDocumentsResult>`.

- [ ] **Step 1: Write the failing test**

Add to `test/ops.test.ts`, inside the top-level `describe("ops (...)", ...)` block (alongside the existing `describe("listEntriesWithHistory", ...)`):

```ts
  describe("listDocuments", () => {
    it("POSTs containerTags to /v3/documents/list and returns the (confusingly named) memories array", async () => {
      const fetchMock = mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({
          memories: [
            { id: "doc_1", title: "PR #171", summary: "s", status: "done", type: "text", createdAt: "t", updatedAt: "t" },
          ],
          pagination: { currentPage: 1, totalItems: 1, totalPages: 1 },
        }),
      });

      const result = await listDocuments(config, "src_github");

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:6767/v3/documents/list");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual(expect.objectContaining({ containerTags: ["src_github"], limit: 200 }));
      expect(result.memories[0].title).toBe("PR #171");
    });
  });
```

Add `listDocuments` to the existing import block at the top of `test/ops.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/ops.test.ts`
Expected: FAIL — `listDocuments is not a function` (or a TS import error).

- [ ] **Step 3: Write minimal implementation**

Append to `src/supermemory/ops.ts`:

```ts
/** A document record as returned by /v3/documents/list. */
export interface DocumentRecord {
  id: string;
  title: string | null;
  summary: string | null;
  status: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  customId?: string | null;
  url?: string | null;
  connectionId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ListDocumentsResult {
  /**
   * NOTE: the response key really is `memories`, even though these are
   * documents — confirmed from the live server's own OpenAPI spec, not a typo.
   */
  memories: DocumentRecord[];
  pagination: {
    currentPage: number;
    totalItems: number;
    totalPages: number;
    limit?: number;
  };
}

// SOURCE: live GET /v4/openapi on server-v0.0.5, path POST /v3/documents/list
// (operationId postV3DocumentsList, "List documents") — path/response CONFIRMED
// 2026-07-17. The `containerTags` request param is marked deprecated/hidden on
// THIS endpoint (unlike /v4/memories/list) — STATUS: UNVERIFIED whether it
// actually filters; Task 2's join is defensive either way. See
// docs/api-verification.md §14.
export async function listDocuments(
  config: CuratorConfig,
  containerTag: string,
): Promise<ListDocumentsResult> {
  return rawRequest<ListDocumentsResult>(config, "/v3/documents/list", {
    method: "POST",
    body: { containerTags: [containerTag], limit: 200 },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/ops.test.ts` → Expected: PASS
Run: `npx tsc --noEmit -p tsconfig.json` → Expected: no output

- [ ] **Step 5: Commit**

```bash
git add src/supermemory/ops.ts test/ops.test.ts
git commit -m "feat: ops.listDocuments for the confirmed /v3/documents/list endpoint"
```

---

### Task 2: `buildGraphDocuments()` — pure join/shape logic

**Files:**
- Create: `src/ui/graph.ts`
- Test: `test/graph-shape.test.ts`

**Interfaces:**
- Consumes: `DocumentRecord` from `../supermemory/ops.js`, `MemoryEntryWithHistory` from `../supermemory/ops.js` (both already exported).
- Produces: `export interface GraphApiMemory`, `export interface GraphApiDocument`, `export function buildGraphDocuments(documents: DocumentRecord[], entries: MemoryEntryWithHistory[]): GraphApiDocument[]`.

**Why these exact types:** they mirror `@supermemory/memory-graph`'s own `GraphApiDocument`/`GraphApiMemory` (verified from its `dist/types.d.ts`, since `MemoryGraphProps.documents` is `GraphApiDocument[]`). We redeclare them backend-side rather than importing the React package into Node code.

- [ ] **Step 1: Write the failing test**

Create `test/graph-shape.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/graph-shape.test.ts`
Expected: FAIL — cannot resolve `../src/ui/graph.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/graph.ts`:

```ts
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
 * defensive, since /v3/documents/list's containerTags filter is unverified
 * and might return a narrower set than the memories reference.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/graph-shape.test.ts` → Expected: PASS (7 tests)
Run: `npx tsc --noEmit -p tsconfig.json` → Expected: no output

- [ ] **Step 5: Commit**

```bash
git add src/ui/graph.ts test/graph-shape.test.ts
git commit -m "feat: buildGraphDocuments joins documents and memories for the graph"
```

---

### Task 3: `GET /api/graph` route

**Files:**
- Modify: `src/ui/server.ts`
- Test: `test/ui-server.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: `listDocuments` (Task 1), `buildGraphDocuments` (Task 2), existing `listEntriesWithHistory`.
- Produces: `GET /api/graph?tag=<tag>` → `{documents: GraphApiDocument[]}`.

- [ ] **Step 1: Write the failing test**

Add to `test/ui-server.test.ts` (follows the existing `mockSupermemoryFetch` routing-mock pattern already in that file):

```ts
describe("GET /api/graph", () => {
  it("joins /v3/documents/list and /v4/memories/list into graph documents", async () => {
    const fetchMock = mockSupermemoryFetch((url) => {
      if (url.endsWith("/v3/documents/list")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            memories: [
              { id: "doc_1", title: "PR #171", summary: "s", status: "done", type: "text", createdAt: "t", updatedAt: "t" },
            ],
            pagination: { currentPage: 1, totalItems: 1, totalPages: 1 },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          memoryEntries: [
            {
              id: "mem_1", memory: "m", version: 1, isLatest: true, isForgotten: false,
              isStatic: false, isInference: false, createdAt: "t", updatedAt: "t",
              spaceId: "space_1", orgId: "org_1", sourceCount: 1, parentMemoryId: null,
              rootMemoryId: "mem_1", forgetAfter: null, forgetReason: null, metadata: null,
              memoryRelations: null, temporalContext: null, history: [], documentIds: ["doc_1"],
            },
          ],
          pagination: { currentPage: 1, totalItems: 1, totalPages: 1 },
        }),
      };
    });
    await startTestServer();

    const res = await realFetch(`${baseUrl}/api/graph?tag=src_github`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].id).toBe("doc_1");
    expect(body.documents[0].documentType).toBe("text");
    expect(body.documents[0].memories[0].id).toBe("mem_1");

    const calledPaths = supermemoryCalls(fetchMock).map(([url]) => url);
    expect(calledPaths).toContain("http://localhost:6767/v3/documents/list");
    expect(calledPaths).toContain("http://localhost:6767/v4/memories/list");
  });

  it("returns 500 with an error message when Supermemory fails", async () => {
    mockSupermemoryFetch(() => ({ ok: false, status: 500, text: async () => "boom" }));
    await startTestServer();

    const res = await realFetch(`${baseUrl}/api/graph?tag=src_github`);

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("Supermemory request failed");
  });
});
```

**Note:** reuse the existing `mockSupermemoryFetch` / `supermemoryCalls` / `startTestServer` / `realFetch` / `baseUrl` helpers already at the top of this file — do not duplicate them. `mockSupermemoryFetch`'s impl callback already receives `(url, init)`, which is what lets this test branch on the path.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/ui-server.test.ts`
Expected: FAIL — the graph test gets `404` (`no route for GET /api/graph`).

- [ ] **Step 3: Write minimal implementation**

In `src/ui/server.ts`, extend the ops import to include `listDocuments`:

```ts
import {
  forgetById,
  forgetByPrompt,
  listDocuments,
  listEntriesWithHistory,
  listInferred,
  reviewInferred,
  type ReviewAction,
} from "../supermemory/ops.js";
import { buildGraphDocuments } from "./graph.js";
```

Then add this route inside `handleRequest`, immediately after the `/api/memories` block:

```ts
      if (req.method === "GET" && url.pathname === "/api/graph") {
        const tag = url.searchParams.get("tag") ?? DEFAULT_CONTAINER_TAG;
        const [documents, entries] = await Promise.all([
          listDocuments(deps.config, tag),
          listEntriesWithHistory(deps.config, [tag]),
        ]);
        return sendJson(res, 200, {
          documents: buildGraphDocuments(documents.memories, entries.memoryEntries),
        });
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/ui-server.test.ts` → Expected: PASS
Run: `npx tsc --noEmit -p tsconfig.json` → Expected: no output

- [ ] **Step 5: Commit**

```bash
git add src/ui/server.ts test/ui-server.test.ts
git commit -m "feat: GET /api/graph joining documents and memories"
```

---

### Task 4: Tailwind + fonts + visual primitives

**Files:**
- Modify: `package.json`
- Create: `src/ui/app/tailwind.config.js`, `src/ui/app/postcss.config.js`, `src/ui/app/src/index.css`, `src/ui/app/src/components/ui.tsx`
- Modify: `src/ui/app/src/main.tsx`
- Test: `test/ui-components.test.tsx` (add a `describe` block)

**Interfaces:**
- Produces: `export function Card({title, children, className}: {title?: string; children: React.ReactNode; className?: string})`, `export function Badge({children, tone}: {children: React.ReactNode; tone?: "neutral" | "blue" | "green" | "red"})`, `export function TabBar({tabs, active, onChange}: {tabs: {id: string; label: string}[]; active: string; onChange: (id: string) => void})`.

- [ ] **Step 1: Install dependencies**

```bash
pnpm add @supermemory/memory-graph @fontsource/inter @fontsource/space-grotesk @fontsource/jetbrains-mono
pnpm add -D tailwindcss@^3 postcss autoprefixer
```

Expected: installs cleanly. (`@supermemory/memory-graph` is a runtime dep — it ships to the browser bundle. Tailwind/PostCSS are build-time only.)

- [ ] **Step 2: Write the failing test**

Add to `test/ui-components.test.tsx`:

```tsx
import { Badge, Card, TabBar } from "../src/ui/app/src/components/ui.js";

describe("ui primitives", () => {
  it("Card renders its title and children", () => {
    const html = renderToStaticMarkup(<Card title="Memories">content here</Card>);
    expect(html).toContain("Memories");
    expect(html).toContain("content here");
  });

  it("Badge renders its children", () => {
    const html = renderToStaticMarkup(<Badge tone="green">done</Badge>);
    expect(html).toContain("done");
  });

  it("TabBar renders every tab and marks the active one", () => {
    const html = renderToStaticMarkup(
      <TabBar
        tabs={[{ id: "memories", label: "Memories" }, { id: "graph", label: "Graph" }]}
        active="graph"
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Memories");
    expect(html).toContain("Graph");
    expect(html).toContain('aria-selected="true"');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run test/ui-components.test.tsx`
Expected: FAIL — cannot resolve `../src/ui/app/src/components/ui.js`.

- [ ] **Step 4: Create the Tailwind config**

Create `src/ui/app/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tokens read off the reference screenshots of the hosted console.
        canvas: "#09090b",
        surface: "#101012",
        elevated: "#161618",
        hairline: "rgba(255,255,255,0.10)",
        ink: { DEFAULT: "#fafafa", muted: "#a1a1aa", faint: "#71717a" },
        accent: { blue: "#3b82f6", green: "#22c55e", red: "#ef4444" },
      },
      fontFamily: {
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Space Grotesk"', '"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
```

Create `src/ui/app/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Create the stylesheet**

Create `src/ui/app/src/index.css`:

```css
/* Self-hosted fonts — no CDN, so the console works fully offline. */
@import "@fontsource/inter/400.css";
@import "@fontsource/inter/500.css";
@import "@fontsource/inter/600.css";
@import "@fontsource/space-grotesk/500.css";
@import "@fontsource/space-grotesk/700.css";
@import "@fontsource/jetbrains-mono/400.css";

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-canvas text-ink font-sans antialiased;
  }
}
```

Modify `src/ui/app/src/main.tsx` — add the stylesheet import as the first line:

```tsx
import "./index.css";
import { StrictMode } from "react";
```

- [ ] **Step 6: Write the primitives**

Create `src/ui/app/src/components/ui.tsx`:

```tsx
import type { ReactNode } from "react";

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-hairline bg-surface p-5 ${className}`}>
      {title ? <h2 className="mb-4 font-display text-lg font-medium text-ink">{title}</h2> : null}
      {children}
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-white/5 text-ink-muted",
  blue: "bg-accent-blue/15 text-accent-blue",
  green: "bg-accent-green/15 text-accent-green",
  red: "bg-accent-red/15 text-accent-red",
} as const;

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
}) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="tablist" className="inline-flex gap-1 rounded-xl border border-hairline bg-surface p-1">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              selected ? "bg-elevated text-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm vitest run test/ui-components.test.tsx` → Expected: PASS
Run: `npx tsc --noEmit -p src/ui/app/tsconfig.json` → Expected: no output
Run: `pnpm run build:ui` → Expected: builds; CSS asset now emitted alongside the JS bundle.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/ui/app/tailwind.config.js src/ui/app/postcss.config.js src/ui/app/src/index.css src/ui/app/src/main.tsx src/ui/app/src/components/ui.tsx test/ui-components.test.tsx
git commit -m "feat: tailwind visual system, self-hosted fonts, ui primitives"
```

---

### Task 5: Restyle the three existing tab panels

**Files:**
- Modify: `src/ui/app/src/components/MemoryBrowser.tsx`, `src/ui/app/src/components/ReviewQueue.tsx`, `src/ui/app/src/components/ForgetConsole.tsx`
- Test: `test/ui-components.test.tsx` (existing assertions must keep passing)

**Interfaces:**
- Consumes: `Badge` from `./ui.js` (Task 4).
- Produces: no prop-signature changes. `MemoryBrowserProps`, `ReviewQueueProps`, `ForgetConsoleProps` stay exactly as they are — this is a restyle only.

**Constraint:** every existing test in `test/ui-components.test.tsx` must still pass unchanged (they assert content, empty states, `data-testid`s, and dry-run gating — all behavior a restyle must not alter). Keep every `data-testid`.

- [ ] **Step 1: Run the existing tests to establish the green baseline**

Run: `pnpm vitest run test/ui-components.test.tsx`
Expected: PASS. These are the contract for this task.

- [ ] **Step 2: Restyle MemoryBrowser**

Rewrite `src/ui/app/src/components/MemoryBrowser.tsx` (same props, same testids, same logic):

```tsx
import type { MemoryEntry } from "../api.js";
import { Badge } from "./ui.js";

export interface MemoryBrowserProps {
  tag: string;
  memories: MemoryEntry[];
  loading?: boolean;
}

export function MemoryBrowser({ tag, memories, loading }: MemoryBrowserProps) {
  if (loading) {
    return (
      <p data-testid="memory-browser-loading" className="text-sm text-ink-muted">
        Loading memories for {tag}…
      </p>
    );
  }

  if (memories.length === 0) {
    return (
      <p data-testid="memory-browser-empty" className="text-sm text-ink-muted">
        No memories stored under &quot;{tag}&quot; yet.
      </p>
    );
  }

  return (
    <ul data-testid="memory-browser-list" className="divide-y divide-hairline">
      {memories.map((memory) => (
        <li key={memory.id} data-testid="memory-entry" className="py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-relaxed text-ink">{memory.memory}</p>
            {!memory.isLatest ? (
              <span data-testid="memory-not-latest">
                <Badge tone="neutral">superseded</Badge>
              </span>
            ) : null}
          </div>
          {memory.memoryRelations && Object.keys(memory.memoryRelations).length > 0 ? (
            <ul data-testid="memory-relations" className="mt-2 flex flex-wrap gap-2">
              {Object.entries(memory.memoryRelations).map(([relatedId, relation]) => (
                <li key={relatedId} className="font-mono text-xs text-ink-faint">
                  {relation} → {relatedId}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Restyle ReviewQueue**

Rewrite `src/ui/app/src/components/ReviewQueue.tsx` (same props, same conditional-render rule):

```tsx
import type { InferredMemory, ReviewAction } from "../api.js";

export interface ReviewQueueProps {
  supported: boolean;
  items: InferredMemory[];
  onAction: (id: string, action: ReviewAction) => void;
}

/**
 * Renders nothing when the backend reports the review-queue endpoint is
 * unsupported on this Supermemory Local instance, per
 * docs/implementation-plan.md §6 — no dead UI for a capability Local may
 * not have. (Confirmed present on server-v0.0.5; see docs/api-verification.md §7.)
 */
export function ReviewQueue({ supported, items, onAction }: ReviewQueueProps) {
  if (!supported) return null;

  if (items.length === 0) {
    return (
      <p data-testid="review-queue-empty" className="text-sm text-ink-muted">
        No inferred memories awaiting review.
      </p>
    );
  }

  return (
    <ul data-testid="review-queue-list" className="divide-y divide-hairline">
      {items.map((item) => (
        <li key={item.id} data-testid="review-item" className="flex items-start justify-between gap-4 py-3">
          <p className="text-sm leading-relaxed text-ink">{item.memory}</p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => onAction(item.id, "approve")}
              className="rounded-lg border border-hairline px-3 py-1 text-xs font-medium text-accent-green hover:bg-white/5"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => onAction(item.id, "decline")}
              className="rounded-lg border border-hairline px-3 py-1 text-xs font-medium text-accent-red hover:bg-white/5"
            >
              Decline
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Restyle ForgetConsole**

Rewrite `src/ui/app/src/components/ForgetConsole.tsx` (same props, same preview-then-confirm gating):

```tsx
import type { ForgetPreview } from "../api.js";

export interface ForgetConsoleProps {
  query: string;
  onQueryChange: (value: string) => void;
  onPreview: () => void;
  preview: ForgetPreview | null;
  onConfirm: () => void;
  actionLog: string[];
  previewing?: boolean;
}

/**
 * Always previews (dry-run) before any deletion; "Confirm deletion" only
 * appears once a preview exists, and only fires the dryRun:false call when
 * clicked explicitly — never as a side effect of preview. See
 * docs/implementation-plan.md §6.
 */
export function ForgetConsole({
  query,
  onQueryChange,
  onPreview,
  preview,
  onConfirm,
  actionLog,
  previewing,
}: ForgetConsoleProps) {
  return (
    <div data-testid="forget-console" className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          placeholder="e.g. everything about client X"
          onChange={(e) => onQueryChange(e.target.value)}
          data-testid="forget-input"
          className="flex-1 rounded-lg border border-hairline bg-elevated px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-blue focus:outline-none"
        />
        <button
          type="button"
          onClick={onPreview}
          disabled={!query || previewing}
          data-testid="forget-preview-button"
          className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink hover:bg-white/5 disabled:opacity-40"
        >
          {previewing ? "Previewing…" : "Preview"}
        </button>
      </div>

      {preview ? (
        <div data-testid="forget-preview" className="rounded-xl border border-hairline bg-elevated p-4">
          <p className="text-sm text-ink">
            {preview.summary ?? preview.note ?? `${preview.count ?? 0} memories would be forgotten`}
          </p>
          {preview.candidates && preview.candidates.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {preview.candidates.map((c) => (
                <li key={c.id} className="text-sm text-ink-muted">
                  {c.memory}
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={onConfirm}
            data-testid="forget-confirm-button"
            className="mt-4 rounded-lg bg-accent-red px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Confirm deletion
          </button>
        </div>
      ) : null}

      {actionLog.length > 0 ? (
        <ul data-testid="forget-action-log" className="space-y-1 border-t border-hairline pt-3">
          {actionLog.map((entry, i) => (
            <li key={i} className="font-mono text-xs text-ink-faint">
              {entry}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify the restyle changed nothing behavioral**

Run: `pnpm vitest run test/ui-components.test.tsx` → Expected: PASS (unchanged assertions)
Run: `npx tsc --noEmit -p src/ui/app/tsconfig.json` → Expected: no output

- [ ] **Step 6: Commit**

```bash
git add src/ui/app/src/components/MemoryBrowser.tsx src/ui/app/src/components/ReviewQueue.tsx src/ui/app/src/components/ForgetConsole.tsx
git commit -m "feat: restyle memory browser, review queue, and forget console"
```

---

### Task 6: `GraphView` — the Memory Graph tab

**Files:**
- Create: `src/ui/app/src/components/GraphView.tsx`, `src/ui/app/src/fixtures/graph.json`
- Modify: `src/ui/app/src/api.ts`
- Test: `test/ui-components.test.tsx` (add a `describe` block)

**Interfaces:**
- Consumes: `MemoryGraph` from `@supermemory/memory-graph`, `fetchGraph` from `../api.js`.
- Produces: `export interface GraphApiDocument` + `export async function fetchGraph(tag: string): Promise<GraphResponse>` in `api.ts`; `export function GraphView({tag}: {tag: string})`.

- [ ] **Step 1: Add the fixture**

Create `src/ui/app/src/fixtures/graph.json`:

```json
{
  "documents": [
    {
      "id": "doc_1",
      "title": "PR #171 — make AOI upload logo optional",
      "summary": "Refactored AOI upload logic so the logo file is optional.",
      "documentType": "text",
      "createdAt": "2026-07-16T12:52:01.463Z",
      "updatedAt": "2026-07-16T12:52:01.463Z",
      "memories": [
        {
          "id": "mem_1",
          "memory": "PR #171 refactored the AOI upload logic in Medullabs to make the logo file optional.",
          "isStatic": false,
          "spaceId": "PhuHqfimXPBK2iHUJcB4E1",
          "isLatest": true,
          "isForgotten": false,
          "forgetAfter": null,
          "forgetReason": null,
          "version": 1,
          "parentMemoryId": null,
          "rootMemoryId": "mem_1",
          "createdAt": "2026-07-16T12:52:01.463Z",
          "updatedAt": "2026-07-16T12:52:01.463Z",
          "memoryRelations": null
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

`@supermemory/memory-graph` renders a `<canvas>` and reads theme values off the DOM. Our vitest
env is `node` (see `vitest.config.ts`), and per the spec we do **not** test the upstream package's
canvas/d3-force internals — so mock the package. This keeps the test in the node env (no
`happy-dom` needed) and scopes the test to *our* wrapper: fetch wiring, loading/error state, and
the empty-state child.

Add to the **top** of `test/ui-components.test.tsx` (the `vi.mock` call must be at module scope —
vitest hoists it above the imports, and it also covers Task 7's `App` test, which imports
`GraphView` transitively):

```tsx
vi.mock("@supermemory/memory-graph", () => ({
  MemoryGraph: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="mock-memory-graph">{children}</div>
  ),
}));
```

Update that file's vitest import to include `vi`:

```tsx
import { describe, expect, it, vi } from "vitest";
```

Then add the test:

```tsx
import { GraphView } from "../src/ui/app/src/components/GraphView.js";

describe("GraphView", () => {
  it("renders its container and passes an empty-state child to the graph", () => {
    const html = renderToStaticMarkup(<GraphView tag="src_github" />);

    expect(html).toContain("graph-view");
    expect(html).toContain("mock-memory-graph");
    expect(html).toContain("No memories to graph");
  });
});
```

**Note:** `renderToStaticMarkup` runs only the initial pass — `useEffect` never fires, so no fetch
happens and this asserts the pre-fetch state.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run test/ui-components.test.tsx`
Expected: FAIL — cannot resolve `GraphView.js`.

- [ ] **Step 4: Add the API client function**

Append to `src/ui/app/src/api.ts`:

```ts
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
  memoryRelations?: Record<string, "updates" | "extends" | "derives"> | null;
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

export interface GraphResponse {
  documents: GraphApiDocument[];
}

export async function fetchGraph(tag: string): Promise<GraphResponse> {
  const res = await fetch(`/api/graph?tag=${encodeURIComponent(tag)}`);
  if (!res.ok) throw new Error(`Failed to load graph (${res.status})`);
  return res.json();
}
```

- [ ] **Step 5: Write GraphView**

Per the spec, the graph is **not** wrapped in `<Card>` — no title bar, no inner padding — so the
canvas gets the whole panel, matching the reference's full-canvas presentation. It still gets the
same border/radius/surface treatment as a card so it sits consistently in the layout.

Create `src/ui/app/src/components/GraphView.tsx`:

```tsx
import { useEffect, useState } from "react";
import { MemoryGraph } from "@supermemory/memory-graph";
import { fetchGraph, type GraphApiDocument } from "../api.js";

export function GraphView({ tag }: { tag: string }) {
  const [documents, setDocuments] = useState<GraphApiDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGraph(tag)
      .then((res) => {
        if (cancelled) return;
        setDocuments(res.documents);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tag]);

  return (
    <div data-testid="graph-view" className="h-[70vh] overflow-hidden rounded-xl border border-hairline bg-surface">
      <MemoryGraph documents={documents} isLoading={loading} error={error} variant="console">
        <p className="p-6 text-sm text-ink-muted">No memories to graph under &quot;{tag}&quot; yet.</p>
      </MemoryGraph>
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run test/ui-components.test.tsx` → Expected: PASS
Run: `npx tsc --noEmit -p src/ui/app/tsconfig.json` → Expected: no output
Run: `pnpm run build:ui` → Expected: builds (bundle grows — the graph package is now included).

- [ ] **Step 7: Commit**

```bash
git add src/ui/app/src/components/GraphView.tsx src/ui/app/src/fixtures/graph.json src/ui/app/src/api.ts test/ui-components.test.tsx
git commit -m "feat: GraphView tab rendering the official memory-graph component"
```

---

### Task 7: Tab shell in `App.tsx`

**Files:**
- Modify: `src/ui/app/src/App.tsx`
- Test: `test/ui-components.test.tsx` (add a `describe` block)

**Interfaces:**
- Consumes: `Card`, `TabBar` from `./components/ui.js` (Task 4); `GraphView` from `./components/GraphView.js` (Task 6); existing `MemoryBrowser`, `ReviewQueue`, `ForgetConsole`.
- Produces: `export function App()` (unchanged signature).

- [ ] **Step 1: Write the failing test**

Add to `test/ui-components.test.tsx`. This relies on the `vi.mock("@supermemory/memory-graph", ...)`
added at the top of that file in Task 6 — `App` imports `GraphView`, which imports the real canvas
package, so without that mock this test would drag the canvas renderer into the node test env.

```tsx
import { App } from "../src/ui/app/src/App.js";

describe("App tab shell", () => {
  it("renders the tab bar with Memories and Graph tabs", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Memories");
    expect(html).toContain("Graph");
    expect(html).toContain("Forget");
  });

  it("does not render a Review tab before the backend confirms support", () => {
    // Initial render: reviewSupported starts false, so the tab must be absent —
    // no dead tab for a capability the server may not have.
    const html = renderToStaticMarkup(<App />);
    expect(html).not.toContain(">Review<");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/ui-components.test.tsx`
Expected: FAIL — current `App` renders `<h1>Curator — Governance Console</h1>` with stacked sections and no tab bar, so `>Review<` is present and the assertion fails.

- [ ] **Step 3: Rewrite App.tsx**

```tsx
import { useEffect, useState } from "react";
import {
  confirmForget,
  fetchMemories,
  fetchReview,
  postReviewAction,
  previewForget,
  type ForgetPreview,
  type MemoryEntry,
  type ReviewAction,
  type InferredMemory,
} from "./api.js";
import { MemoryBrowser } from "./components/MemoryBrowser.js";
import { ForgetConsole } from "./components/ForgetConsole.js";
import { ReviewQueue } from "./components/ReviewQueue.js";
import { GraphView } from "./components/GraphView.js";
import { Card, TabBar } from "./components/ui.js";

const DEFAULT_TAG = "curator_default";

export function App() {
  const [tag, setTag] = useState(DEFAULT_TAG);
  const [activeTab, setActiveTab] = useState("memories");
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(true);
  const [reviewSupported, setReviewSupported] = useState(false);
  const [reviewItems, setReviewItems] = useState<InferredMemory[]>([]);

  const [forgetQuery, setForgetQuery] = useState("");
  const [forgetPreview, setForgetPreview] = useState<ForgetPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [actionLog, setActionLog] = useState<string[]>([]);

  useEffect(() => {
    setLoadingMemories(true);
    fetchMemories(tag)
      .then((res) => setMemories(res.memoryEntries))
      .catch(() => setMemories([]))
      .finally(() => setLoadingMemories(false));

    fetchReview(tag)
      .then((res) => {
        setReviewSupported(res.supported);
        setReviewItems(res.memories);
      })
      .catch(() => setReviewSupported(false));
  }, [tag]);

  async function handleReviewAction(id: string, action: ReviewAction) {
    await postReviewAction(tag, id, action);
    setReviewItems((items) => items.filter((item) => item.id !== id));
    setActionLog((log) => [`${action} reviewed memory ${id}`, ...log]);
  }

  async function handlePreview() {
    setPreviewing(true);
    try {
      const preview = await previewForget(forgetQuery, tag);
      setForgetPreview(preview);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirm() {
    await confirmForget(forgetQuery, tag);
    setActionLog((log) => [`forgot memories matching "${forgetQuery}"`, ...log]);
    setForgetPreview(null);
    setForgetQuery("");
  }

  // The Review tab only exists if the server actually supports the
  // inferred-memories endpoint — no dead tab. See docs/api-verification.md §7.
  const tabs = [
    { id: "memories", label: "Memories" },
    ...(reviewSupported ? [{ id: "review", label: "Review" }] : []),
    { id: "forget", label: "Forget" },
    { id: "graph", label: "Graph" },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Curator</h1>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Container tag
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            data-testid="tag-input"
            className="rounded-lg border border-hairline bg-elevated px-3 py-1.5 font-mono text-sm text-ink focus:border-accent-blue focus:outline-none"
          />
        </label>
      </header>

      <div className="mb-6">
        <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === "memories" ? (
        <Card title="Memories">
          <MemoryBrowser tag={tag} memories={memories} loading={loadingMemories} />
        </Card>
      ) : null}

      {activeTab === "review" ? (
        <Card title="Review queue">
          <ReviewQueue supported={reviewSupported} items={reviewItems} onAction={handleReviewAction} />
        </Card>
      ) : null}

      {activeTab === "forget" ? (
        <Card title="Forget">
          <ForgetConsole
            query={forgetQuery}
            onQueryChange={setForgetQuery}
            onPreview={handlePreview}
            preview={forgetPreview}
            onConfirm={handleConfirm}
            actionLog={actionLog}
            previewing={previewing}
          />
        </Card>
      ) : null}

      {activeTab === "graph" ? <GraphView tag={tag} /> : null}
    </main>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/ui-components.test.tsx` → Expected: PASS
Run: `npx tsc --noEmit -p src/ui/app/tsconfig.json` → Expected: no output

- [ ] **Step 5: Run the whole suite and both builds**

Run: `pnpm test` → Expected: all PASS
Run: `npx tsc --noEmit -p tsconfig.json` → Expected: no output
Run: `pnpm build && pnpm run build:ui` → Expected: both succeed

- [ ] **Step 6: Commit**

```bash
git add src/ui/app/src/App.tsx test/ui-components.test.tsx
git commit -m "feat: tabbed console shell with conditional review tab"
```

---

### Task 8: Live verification + docs

**Files:**
- Modify: `docs/api-verification.md`, `docs/usage.md`, `docs/progress.md`

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: no code. Records live findings.

**This task is verification-first: run the real thing before writing a word about it.**

- [ ] **Step 1: Start the real server and the console**

Ensure `supermemory-server` is running in WSL (started from the same directory as before, so the data dir and its 16 memories persist). Then:

```bash
pnpm build && pnpm run build:ui
node dist/cli.js status
```
Expected: `Server: reachable (HTTP 200)`.

```bash
node dist/cli.js ui
```
Then open `http://localhost:4141`.

- [ ] **Step 2: Verify the `containerTags` filter question from Task 1**

This is the one item the spec flagged UNVERIFIED. With the console running, in a second terminal:

```bash
curl -s -X POST http://localhost:6767/v3/documents/list \
  -H "Content-Type: application/json" \
  -d '{"containerTags":["src_github"],"limit":200}' | head -c 400
echo
curl -s -X POST http://localhost:6767/v3/documents/list \
  -H "Content-Type: application/json" \
  -d '{"containerTags":["curator_default"],"limit":200}' | head -c 400
```

(No auth header needed — localhost auto-auth, confirmed in `docs/api-verification.md` §13.)

**Decide from the real output:**
- If the two calls return **different** document sets → the filter works. Leave `listDocuments` as-is; flip its `containerTags` comment from UNVERIFIED to CONFIRMED.
- If they return the **same** set (filter ignored) → the filter is inert. Keep the call as-is (harmless), but change the comment to record that it does **not** filter, and note that `/api/graph`'s join is what actually scopes the result: memories come from `/v4/memories/list` which *is* tag-filtered, and `buildGraphDocuments` only emits documents that have matching memories — so unfiltered documents are naturally excluded. **No code change needed either way** — this is why Task 2's join was built defensively.

- [ ] **Step 3: Verify the graph in the browser**

In the console at `http://localhost:4141`:
1. Set the container tag to `src_github`.
2. Click the **Graph** tab.
3. Confirm: nodes render (documents + memories), the canvas pans/zooms, and clicking a memory node opens the component's detail popover.
4. Click through **Memories**, **Review**, **Forget** tabs — confirm the dark restyle renders and the Review tab is present (server-v0.0.5 supports it).

Take a screenshot for the demo/README if it looks good.

- [ ] **Step 4: Record findings in `docs/api-verification.md`**

Add a new `## 14. Documents list + graph (2026-07-17)` section covering:
- `POST /v3/documents/list` — CONFIRMED path/response `{memories: DocumentRecord[], pagination}`, noting the response key really is `memories` despite being documents.
- The `containerTags` filter outcome from Step 2 (whichever branch was true), with the actual observed evidence.
- That `/api/graph` joins it with `/v4/memories/list` via `documentIds[0]`, and that unmatched memories bucket into a synthetic "Ungrouped" document.

- [ ] **Step 5: Update `docs/usage.md`**

In the `## 9. curator ui — governance console` section:
- Change the panel list to a **tab** list: Memories / Review / Forget / Graph.
- Add the Graph tab: renders the official `@supermemory/memory-graph` component (MIT, credited), documents as nodes with their memories, click a node for details.
- Add `GET /api/graph?tag=` to the API-routes line.
- Note the console is now a dark, tabbed UI with self-hosted fonts (works fully offline).

- [ ] **Step 6: Update `docs/progress.md`**

Add a commit row for this feature and update the test-count total. In "What works right now", add the graph line with whatever was actually observed in Step 3 — **only claim what was seen on screen**.

- [ ] **Step 7: Commit**

```bash
git add docs/api-verification.md docs/usage.md docs/progress.md
git commit -m "docs: record live graph verification and console restyle"
```

---

## Credits reminder

`docs/plan.md` §13 and the README both require crediting `@supermemory/memory-graph` as a dependency (MIT, Supermemory's own component) — the "what I built vs what I used" section. If the README exists by the time this ships, ensure the graph component is listed there. If it doesn't exist yet, this is a note for whoever writes it, not a blocker for this plan.
