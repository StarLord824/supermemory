# Container tag discovery + Home/Docs tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users discover which container tags actually exist (CLI `curator tags` + a UI search+dropdown) instead of typing one blind, and add Home/Docs tabs to the console for orientation.

**Architecture:** One new backend function (`ops.listContainerTags`) derives the tag set by paging through `/v3/documents/list` with no filter and deduping each document's `containerTags[]` — there is no native "list tags" endpoint. This is exposed via a new `GET /api/tags` route, a new `curator tags` CLI command, and a UI `TagPicker` that replaces the free-text tag input. Two new presentational tabs (Home, Docs) round out the console.

**Tech Stack:** Same as the rest of the project — TypeScript/Node ESM, `vitest` (mocked `global.fetch`, `renderToStaticMarkup` for components, no jsdom), plain `node:http` backend, Vite + React 18 frontend, Tailwind (already wired).

## Global Constraints

- **All Supermemory HTTP paths/payloads live ONLY in `src/supermemory/ops.ts`.** No other file may name a Supermemory endpoint path.
- **Confirmed API facts this plan is built on (do not re-derive or second-guess):**
  - There is no native "list container tags" endpoint — `GET /v3/container-tags` returns `404`.
  - `POST /v3/documents/list` called with **no** `containerTags` field in the body returns documents across **every** tag; each document carries its own `containerTags: string[]`.
  - That same endpoint supports `{limit, page}` pagination; the response's `pagination.totalPages` tells you when to stop.
  - All three facts were confirmed live against the running server on 2026-07-17 — see `docs/api-verification.md` §14 (containerTags filter) and the new §15 this plan's Task 7 adds.
- **`DocumentRecord`'s new `containerTags` field must be added as optional** (`containerTags?: string[]`). `test/graph-shape.test.ts` constructs `DocumentRecord` object literals without it (checked against the current file) — making it required would break `tsc --noEmit` there for no reason. Do not touch `test/graph-shape.test.ts`.
- **`TagPicker` uses a native `<input list="...">` + `<datalist>`**, not a hand-rolled JS dropdown with custom keyboard handling. This was decided at plan-writing time (not in the original brainstorming spec, which described a more elaborate custom combobox) because the native element satisfies every functional requirement — browser-driven search-as-you-type suggestions, and free text is *always* valid input regardless of the list — with zero custom state/keyboard code, and its `<option>` elements are always present in server-rendered markup, making it trivially testable with this project's `renderToStaticMarkup`-only test setup. A hand-rolled dropdown's open/closed state would not be inspectable that way.
- **Component tests use `react-dom/server`'s `renderToStaticMarkup` only.** No jsdom, no testing-library, anywhere in this project. Do not add one. New component tests follow the exact pattern already in `test/ui-components.test.tsx`.
- **Conventional commits** (`feat:`/`fix:`/`docs:`/`chore:`), one commit per task minimum, never squashed.
- **Test commands:** `pnpm test` (all), `pnpm vitest run test/<name>.test.ts` (one file).
- **Typecheck:** backend `npx tsc --noEmit -p tsconfig.json`; frontend `npx tsc --noEmit -p src/ui/app/tsconfig.json`.
- **Builds:** `pnpm build` (backend/CLI), `pnpm run build:ui` (console SPA).
- **Do not touch:** MCP server tools, `src/sync/*`, the CLI's existing `mcp`/`status`/`sync`/`connect`/`ui` command bodies, or the internal logic of `MemoryBrowser.tsx`/`ReviewQueue.tsx`/`ForgetConsole.tsx`/`GraphView.tsx` (their files may only be *imported* by `App.tsx`, not edited).

---

### Task 1: `ops.listContainerTags()`

**Files:**
- Modify: `src/supermemory/ops.ts`
- Test: `test/ops.test.ts`

**Interfaces:**
- Consumes: `rawRequest` (existing), `CuratorConfig` (existing), the existing `ListDocumentsResult`/`DocumentRecord` types (extended here).
- Produces: `export interface ContainerTagSummary { tag: string; documentCount: number }`, `export interface ListContainerTagsResult { tags: ContainerTagSummary[] }`, `export async function listContainerTags(config: CuratorConfig): Promise<ListContainerTagsResult>` — used by Task 2 (route) and Task 3 (CLI).

- [ ] **Step 1: Write the failing tests**

Open `test/ops.test.ts`. Add a new helper right after the existing `mockFetchOnce` (around line 23), for tests that need different responses on successive calls:

```ts
function mockFetchSequence(
  responses: Array<{ ok: boolean; status: number; json?: () => Promise<unknown>; text?: () => Promise<string> }>,
) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
```

Then add a new `describe("listContainerTags", ...)` block immediately after the existing `describe("listDocuments", ...)` block (it currently ends around line 149, right before `describe("getProfile", ...)`):

```ts
  describe("listContainerTags", () => {
    it("derives tags from /v3/documents/list with NO containerTags filter, deduping and counting", async () => {
      const fetchMock = mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({
          memories: [
            { id: "d1", title: "t", summary: null, status: "done", type: "text", createdAt: "t", updatedAt: "t", containerTags: ["src_github"] },
            { id: "d2", title: "t", summary: null, status: "done", type: "text", createdAt: "t", updatedAt: "t", containerTags: ["src_github"] },
            { id: "d3", title: "t", summary: null, status: "done", type: "text", createdAt: "t", updatedAt: "t", containerTags: ["curator_default"] },
          ],
          pagination: { currentPage: 1, totalItems: 3, totalPages: 1 },
        }),
      });

      const result = await listContainerTags(config);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:6767/v3/documents/list");
      expect(JSON.parse(init.body)).toEqual({ limit: 200, page: 1 });
      expect(result.tags).toEqual([
        { tag: "curator_default", documentCount: 1 },
        { tag: "src_github", documentCount: 2 },
      ]);
    });

    it("pages through multiple pages and merges results", async () => {
      const fetchMock = mockFetchSequence([
        {
          ok: true,
          status: 200,
          json: async () => ({
            memories: [
              { id: "d1", title: "t", summary: null, status: "done", type: "text", createdAt: "t", updatedAt: "t", containerTags: ["a"] },
            ],
            pagination: { currentPage: 1, totalItems: 2, totalPages: 2 },
          }),
        },
        {
          ok: true,
          status: 200,
          json: async () => ({
            memories: [
              { id: "d2", title: "t", summary: null, status: "done", type: "text", createdAt: "t", updatedAt: "t", containerTags: ["b"] },
            ],
            pagination: { currentPage: 2, totalItems: 2, totalPages: 2 },
          }),
        },
      ]);

      const result = await listContainerTags(config);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [, secondInit] = fetchMock.mock.calls[1];
      expect(JSON.parse(secondInit.body)).toEqual({ limit: 200, page: 2 });
      expect(result.tags).toEqual([
        { tag: "a", documentCount: 1 },
        { tag: "b", documentCount: 1 },
      ]);
    });

    it("stops at a safety cap of 10 pages even if the server reports more", async () => {
      const fetchMock = mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({
          memories: [
            { id: "d1", title: "t", summary: null, status: "done", type: "text", createdAt: "t", updatedAt: "t", containerTags: ["a"] },
          ],
          pagination: { currentPage: 1, totalItems: 999, totalPages: 999 },
        }),
      });

      await listContainerTags(config);

      expect(fetchMock).toHaveBeenCalledTimes(10);
    });
  });
```

Also add `listContainerTags` to the import list at the top of the file (alongside `listDocuments`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/ops.test.ts`
Expected: FAIL — `listContainerTags is not a function` (or similar import error).

- [ ] **Step 3: Implement**

In `src/supermemory/ops.ts`, add `containerTags?: string[];` to the existing `DocumentRecord` interface (it currently has `id`, `title`, `summary`, `status`, `type`, `createdAt`, `updatedAt`, `customId?`, `url?`, `connectionId?`, `metadata?` — add the new field alongside the other optional ones). Then add this immediately after the existing `listDocuments` function:

```ts
export interface ContainerTagSummary {
  tag: string;
  documentCount: number;
}

export interface ListContainerTagsResult {
  tags: ContainerTagSummary[];
}

// Self-imposed safety bound, not a server-confirmed limit: caps how many
// /v3/documents/list pages this will walk while deriving the tag set, so a
// very large install can't turn one call into an unbounded loop.
const MAX_TAG_DISCOVERY_PAGES = 10;

// SOURCE: same endpoint as listDocuments (POST /v3/documents/list, confirmed
// §14) called with NO containerTags filter — confirmed live 2026-07-17 to
// return documents across every tag, each carrying its own containerTags[].
// There is no dedicated "list container tags" endpoint (GET /v3/container-tags
// returns 404 — confirmed live); this derives the tag set by paging through
// every document instead. See docs/api-verification.md §15.
export async function listContainerTags(config: CuratorConfig): Promise<ListContainerTagsResult> {
  const counts = new Map<string, number>();
  let page = 1;
  let totalPages = 1;

  do {
    const result = await rawRequest<ListDocumentsResult>(config, "/v3/documents/list", {
      method: "POST",
      body: { limit: 200, page },
    });
    for (const doc of result.memories) {
      for (const tag of doc.containerTags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    totalPages = result.pagination.totalPages;
    page += 1;
  } while (page <= totalPages && page <= MAX_TAG_DISCOVERY_PAGES);

  const tags = [...counts.entries()]
    .map(([tag, documentCount]) => ({ tag, documentCount }))
    .sort((a, b) => a.tag.localeCompare(b.tag));

  return { tags };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/ops.test.ts`
Expected: PASS (all tests in the file, including the 3 new ones)

- [ ] **Step 5: Run full suite and typecheck**

Run: `pnpm test` → Expected: all PASS
Run: `npx tsc --noEmit -p tsconfig.json` → Expected: no output

- [ ] **Step 6: Commit**

```bash
git add src/supermemory/ops.ts test/ops.test.ts
git commit -m "feat: ops.listContainerTags derives the tag set from /v3/documents/list"
```

---

### Task 2: `GET /api/tags` route

**Files:**
- Modify: `src/ui/server.ts`
- Test: `test/ui-server.test.ts`

**Interfaces:**
- Consumes: `listContainerTags` from Task 1 (`src/supermemory/ops.js`).
- Produces: `GET /api/tags` → `200 { tags: ContainerTagSummary[] }` — used by Task 4's frontend `fetchTags()`.

- [ ] **Step 1: Write the failing test**

In `test/ui-server.test.ts`, add a new `describe` block (placed anywhere after the existing `describe("GET /api/memories", ...)` block — e.g. right after it):

```ts
describe("GET /api/tags", () => {
  it("delegates to ops.listContainerTags with no containerTags filter", async () => {
    const fetchMock = mockSupermemoryFetch(() => ({
      ok: true,
      status: 200,
      json: async () => ({
        memories: [
          { id: "d1", title: "t", summary: null, status: "done", type: "text", createdAt: "t", updatedAt: "t", containerTags: ["src_github"] },
        ],
        pagination: { currentPage: 1, totalItems: 1, totalPages: 1 },
      }),
    }));
    await startTestServer();

    const res = await realFetch(`${baseUrl}/api/tags`);
    const body = await res.json();

    expect(res.status).toBe(200);
    const [smCall] = supermemoryCalls(fetchMock);
    expect(smCall[0]).toBe("http://localhost:6767/v3/documents/list");
    expect(JSON.parse((smCall[1] as RequestInit).body as string)).toEqual({ limit: 200, page: 1 });
    expect(body.tags).toEqual([{ tag: "src_github", documentCount: 1 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/ui-server.test.ts`
Expected: FAIL — `GET /api/tags` returns the handler's fallback 404 (`no route for GET /api/tags`), so `body.tags` is `undefined`.

- [ ] **Step 3: Implement the route**

In `src/ui/server.ts`, add `listContainerTags` to the existing import from `../supermemory/ops.js` (alongside `forgetById`, `listDocuments`, etc.). Then add this route, placed right after the existing `/api/graph` block:

```ts
      if (req.method === "GET" && url.pathname === "/api/tags") {
        const result = await listContainerTags(deps.config);
        return sendJson(res, 200, result);
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/ui-server.test.ts`
Expected: PASS

- [ ] **Step 5: Run full suite and typecheck**

Run: `pnpm test` → Expected: all PASS
Run: `npx tsc --noEmit -p tsconfig.json` → Expected: no output

- [ ] **Step 6: Commit**

```bash
git add src/ui/server.ts test/ui-server.test.ts
git commit -m "feat: GET /api/tags exposes the derived container tag list"
```

---

### Task 3: `formatTagsTable()` + `curator tags` CLI command

**Files:**
- Create: `src/cli-format.ts`
- Test: `test/cli-format.test.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Consumes: `ContainerTagSummary` (Task 1), `listContainerTags` (Task 1), `resolveConfig` (existing, from `./config.js`).
- Produces: `export function formatTagsTable(tags: ContainerTagSummary[]): string` — pure, no I/O. New `curator tags` command (no exported interface; it's a leaf CLI action).

- [ ] **Step 1: Write the failing test**

Create `test/cli-format.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/cli-format.test.ts`
Expected: FAIL — cannot find module `../src/cli-format.js`

- [ ] **Step 3: Implement**

Create `src/cli-format.ts`:

```ts
import type { ContainerTagSummary } from "./supermemory/ops.js";

/** Plain-text table for `curator tags`: one row per tag, sorted alphabetically, with a document count column. */
export function formatTagsTable(tags: ContainerTagSummary[]): string {
  if (tags.length === 0) {
    return "No container tags found yet — run `curator sync` or `curator connect` to add data.";
  }
  const tagWidth = Math.max(...tags.map((t) => t.tag.length), "TAG".length);
  const header = `${"TAG".padEnd(tagWidth)}  DOCUMENTS`;
  const rows = tags.map((t) => `${t.tag.padEnd(tagWidth)}  ${t.documentCount}`);
  return [header, ...rows].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/cli-format.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the CLI command**

In `src/cli.ts`, add this command definition after the existing `ui` command (i.e. right before the `if (process.argv.length <= 2) {` block at the end of the file):

```ts
program
  .command("tags")
  .description("List container tags found in Supermemory Local (derived from /v3/documents/list — there is no native list-tags endpoint)")
  .action(async () => {
    try {
      const config = resolveConfig();
      const { listContainerTags } = await import("./supermemory/ops.js");
      const { formatTagsTable } = await import("./cli-format.js");
      const result = await listContainerTags(config);
      console.log(formatTagsTable(result.tags));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });
```

This command has no dedicated test — matching the existing convention in this file, where none of `status`, `sync`, `connect`, or `ui`'s commander wiring is unit-tested either (only the underlying logic they delegate to is). Its correctness rides entirely on `formatTagsTable`'s and `listContainerTags`'s own test coverage.

- [ ] **Step 6: Run full suite, typecheck, and build**

Run: `pnpm test` → Expected: all PASS
Run: `npx tsc --noEmit -p tsconfig.json` → Expected: no output
Run: `pnpm build` → Expected: succeeds

- [ ] **Step 7: Commit**

```bash
git add src/cli-format.ts test/cli-format.test.ts src/cli.ts
git commit -m "feat: curator tags command lists known container tags"
```

---

### Task 4: Frontend `fetchTags()` + `TagPicker` component

**Files:**
- Modify: `src/ui/app/src/api.ts`
- Modify: `src/ui/app/src/components/ui.tsx`
- Modify: `src/ui/app/src/App.tsx`
- Test: `test/ui-components.test.tsx`

**Interfaces:**
- Consumes: nothing new from earlier tasks directly (talks to the `/api/tags` route from Task 2 over `fetch`, same pattern as every other `api.ts` function).
- Produces: `export interface TagInfo { tag: string; documentCount: number }`, `export async function fetchTags(): Promise<{ tags: TagInfo[] }>` in `api.ts`; `export function TagPicker({ value, tags, onChange }: { value: string; tags: TagInfo[]; onChange: (tag: string) => void })` in `ui.tsx` — used by Task 5 (`HomeView` consumes the same `tags`/`loadingTags` state this task adds to `App.tsx`).

- [ ] **Step 1: Write the failing test**

In `test/ui-components.test.tsx`, add `TagPicker` to the existing import from `ui.js` (currently `import { Badge, Card, TabBar } from "../src/ui/app/src/components/ui.js";` — change to `import { Badge, Card, TabBar, TagPicker } from "../src/ui/app/src/components/ui.js";`). Then add a new `describe` block, e.g. right after the existing `describe("ui primitives", ...)` block:

```tsx
describe("TagPicker", () => {
  it("reflects the current value and offers known tags as datalist suggestions", () => {
    const html = renderToStaticMarkup(
      <TagPicker
        value="src_github"
        tags={[
          { tag: "src_github", documentCount: 12 },
          { tag: "curator_default", documentCount: 3 },
        ]}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('value="src_github"');
    expect(html).toContain("tag-suggestions");
    expect(html).toContain('value="curator_default"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/ui-components.test.tsx`
Expected: FAIL — `TagPicker` is not exported from `ui.js`

- [ ] **Step 3: Implement `TagPicker`**

In `src/ui/app/src/components/ui.tsx`, add this after the existing `TabBar` function (end of file):

```tsx
export function TagPicker({
  value,
  tags,
  onChange,
}: {
  value: string;
  tags: { tag: string; documentCount: number }[];
  onChange: (tag: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      Container tag
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list="known-container-tags"
        data-testid="tag-input"
        className="rounded-lg border border-hairline bg-elevated px-3 py-1.5 font-mono text-sm text-ink focus:border-accent-blue focus:outline-none"
      />
      <datalist id="known-container-tags" data-testid="tag-suggestions">
        {tags.map((t) => (
          <option key={t.tag} value={t.tag} />
        ))}
      </datalist>
    </label>
  );
}
```

- [ ] **Step 4: Add `fetchTags()` to `api.ts`**

In `src/ui/app/src/api.ts`, add this at the end of the file:

```ts
export interface TagInfo {
  tag: string;
  documentCount: number;
}

export interface TagsResponse {
  tags: TagInfo[];
}

export async function fetchTags(): Promise<TagsResponse> {
  const res = await fetch("/api/tags");
  if (!res.ok) throw new Error(`Failed to load container tags (${res.status})`);
  return res.json();
}
```

- [ ] **Step 5: Wire into `App.tsx`**

In `src/ui/app/src/App.tsx`, make these four changes:

1. Change the `./api.js` import to add `fetchTags` and `type TagInfo`:

```ts
import {
  confirmForget,
  fetchMemories,
  fetchReview,
  fetchTags,
  postReviewAction,
  previewForget,
  type ForgetPreview,
  type MemoryEntry,
  type ReviewAction,
  type InferredMemory,
  type TagInfo,
} from "./api.js";
```

2. Change the `./components/ui.js` import to add `TagPicker`:

```ts
import { Card, TabBar, TagPicker } from "./components/ui.js";
```

3. Add two new state variables right after `const [reviewItems, setReviewItems] = useState<InferredMemory[]>([]);`:

```ts
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
```

4. Add a new effect right after the existing `useEffect(() => { ... }, [tag]);` block (this one fetches once on mount — the tag list doesn't depend on which tag is active):

```ts
  useEffect(() => {
    fetchTags()
      .then((res) => setTags(res.tags))
      .catch(() => setTags([]))
      .finally(() => setLoadingTags(false));
  }, []);
```

5. Replace the header's tag `<label>` block:

```tsx
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Container tag
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            data-testid="tag-input"
            className="rounded-lg border border-hairline bg-elevated px-3 py-1.5 font-mono text-sm text-ink focus:border-accent-blue focus:outline-none"
          />
        </label>
```

with:

```tsx
        <TagPicker value={tag} tags={tags} onChange={setTag} />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run test/ui-components.test.tsx`
Expected: PASS

- [ ] **Step 7: Run full suite, both typechecks, and both builds**

Run: `pnpm test` → Expected: all PASS
Run: `npx tsc --noEmit -p tsconfig.json` → Expected: no output
Run: `npx tsc --noEmit -p src/ui/app/tsconfig.json` → Expected: no output
Run: `pnpm build && pnpm run build:ui` → Expected: both succeed

- [ ] **Step 8: Commit**

```bash
git add src/ui/app/src/api.ts src/ui/app/src/components/ui.tsx src/ui/app/src/App.tsx test/ui-components.test.tsx
git commit -m "feat: TagPicker replaces the free-text tag input with a search+dropdown"
```

---

### Task 5: `HomeView` tab

**Files:**
- Create: `src/ui/app/src/components/HomeView.tsx`
- Modify: `src/ui/app/src/App.tsx`
- Test: `test/ui-components.test.tsx`

**Interfaces:**
- Consumes: `TagInfo` (Task 4, from `../api.js`); `App.tsx`'s `tags`/`loadingTags` state (added in Task 4).
- Produces: `export function HomeView({ tag, tags, loadingTags, memoryCount, reviewSupported }: { tag: string; tags: TagInfo[]; loadingTags: boolean; memoryCount: number; reviewSupported: boolean })`.

- [ ] **Step 1: Write the failing test**

In `test/ui-components.test.tsx`, add the import (near the other component imports, e.g. after the `GraphView` import):

```ts
import { HomeView } from "../src/ui/app/src/components/HomeView.js";
```

Add a new `describe` block, e.g. right after the `describe("TagPicker", ...)` block added in Task 4:

```tsx
describe("HomeView", () => {
  it("renders the live stats it was given", () => {
    const html = renderToStaticMarkup(
      <HomeView
        tag="src_github"
        tags={[{ tag: "src_github", documentCount: 12 }]}
        loadingTags={false}
        memoryCount={7}
        reviewSupported
      />,
    );
    expect(html).toContain("home-view");
    expect(html).toContain(">1<");
    expect(html).toContain(">7<");
    expect(html).toContain("Supported");
  });

  it("shows a loading placeholder for the tag count while tags are still loading", () => {
    const html = renderToStaticMarkup(
      <HomeView tag="src_github" tags={[]} loadingTags memoryCount={0} reviewSupported={false} />,
    );
    expect(html).toContain("…");
    expect(html).toContain("Not available");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/ui-components.test.tsx`
Expected: FAIL — cannot find module `.../HomeView.js`

- [ ] **Step 3: Implement `HomeView`**

Create `src/ui/app/src/components/HomeView.tsx`:

```tsx
import type { TagInfo } from "../api.js";

export function HomeView({
  tag,
  tags,
  loadingTags,
  memoryCount,
  reviewSupported,
}: {
  tag: string;
  tags: TagInfo[];
  loadingTags: boolean;
  memoryCount: number;
  reviewSupported: boolean;
}) {
  return (
    <div data-testid="home-view" className="space-y-6">
      <p className="text-sm text-ink-muted">
        Curator is a local governance console for Supermemory Local — browse memories, review
        what was inferred, forget on request, and see how everything under a container tag
        connects.
      </p>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div data-testid="stat-tags" className="rounded-xl border border-hairline bg-surface p-4">
          <dt className="text-xs text-ink-faint">Container tags found</dt>
          <dd className="mt-1 font-display text-2xl text-ink">{loadingTags ? "…" : tags.length}</dd>
        </div>
        <div data-testid="stat-memories" className="rounded-xl border border-hairline bg-surface p-4">
          <dt className="text-xs text-ink-faint">Memories under &quot;{tag}&quot;</dt>
          <dd className="mt-1 font-display text-2xl text-ink">{memoryCount}</dd>
        </div>
        <div data-testid="stat-review" className="rounded-xl border border-hairline bg-surface p-4">
          <dt className="text-xs text-ink-faint">Review queue</dt>
          <dd className="mt-1 font-display text-2xl text-ink">
            {reviewSupported ? "Supported" : "Not available"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
```

- [ ] **Step 4: Wire into `App.tsx`**

In `src/ui/app/src/App.tsx`, make these four changes:

1. Add the import, alongside the other component imports:

```ts
import { HomeView } from "./components/HomeView.js";
```

2. Change the initial active tab:

```ts
  const [activeTab, setActiveTab] = useState("home");
```

(was `useState("memories")`)

3. Add `"home"` as the first entry in the `tabs` array:

```ts
  const tabs = [
    { id: "home", label: "Home" },
    { id: "memories", label: "Memories" },
    ...(reviewSupported ? [{ id: "review", label: "Review" }] : []),
    { id: "forget", label: "Forget" },
    { id: "graph", label: "Graph" },
  ];
```

4. Change the fallback tab (currently `const active = tabs.some((t) => t.id === activeTab) ? activeTab : "memories";`) to fall back to `"home"`:

```ts
  const active = tabs.some((t) => t.id === activeTab) ? activeTab : "home";
```

5. Add the Home panel, right before the existing `{active === "memories" ? (...) : null}` block:

```tsx
      {active === "home" ? (
        <Card title="Overview">
          <HomeView
            tag={tag}
            tags={tags}
            loadingTags={loadingTags}
            memoryCount={memories.length}
            reviewSupported={reviewSupported}
          />
        </Card>
      ) : null}
```

- [ ] **Step 5: Update the existing `App` tab-shell test**

Replace the current `describe("App tab shell", ...)` block in `test/ui-components.test.tsx` (added in the previous branch's Task 7) with:

```tsx
describe("App tab shell", () => {
  it("renders the tab bar with Home, Memories, Forget, and Graph tabs", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Home");
    expect(html).toContain("Memories");
    expect(html).toContain("Graph");
    expect(html).toContain("Forget");
  });

  it("does not render a Review tab before the backend confirms support", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).not.toContain(">Review<");
  });

  it("shows the Home panel by default", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("home-view");
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run test/ui-components.test.tsx`
Expected: PASS

- [ ] **Step 7: Run full suite, both typechecks, and both builds**

Run: `pnpm test` → Expected: all PASS
Run: `npx tsc --noEmit -p tsconfig.json` → Expected: no output
Run: `npx tsc --noEmit -p src/ui/app/tsconfig.json` → Expected: no output
Run: `pnpm build && pnpm run build:ui` → Expected: both succeed

- [ ] **Step 8: Commit**

```bash
git add src/ui/app/src/components/HomeView.tsx src/ui/app/src/App.tsx test/ui-components.test.tsx
git commit -m "feat: Home tab shows a live overview dashboard, becomes the default tab"
```

---

### Task 6: `DocsView` tab

**Files:**
- Create: `src/ui/app/src/components/DocsView.tsx`
- Modify: `src/ui/app/src/App.tsx`
- Test: `test/ui-components.test.tsx`

**Interfaces:**
- Consumes: nothing (static content, no props, no fetch).
- Produces: `export function DocsView()`.

- [ ] **Step 1: Write the failing test**

In `test/ui-components.test.tsx`, add the import:

```ts
import { DocsView } from "../src/ui/app/src/components/DocsView.js";
```

Add a new `describe` block, e.g. right after `describe("HomeView", ...)`:

```tsx
describe("DocsView", () => {
  it("renders without crashing and documents the core commands and tools", () => {
    const html = renderToStaticMarkup(<DocsView />);
    expect(html).toContain("docs-view");
    expect(html).toContain("curator tags");
    expect(html).toContain("remember");
    expect(html).toContain("forget");
    expect(html).toContain("Dry-run by default");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/ui-components.test.tsx`
Expected: FAIL — cannot find module `.../DocsView.js`

- [ ] **Step 3: Implement `DocsView`**

Create `src/ui/app/src/components/DocsView.tsx`:

```tsx
export function DocsView() {
  return (
    <div data-testid="docs-view" className="space-y-6 text-sm text-ink-muted">
      <section>
        <h3 className="mb-2 font-display text-base text-ink">CLI commands</h3>
        <dl className="space-y-2">
          <div>
            <dt className="font-mono text-ink">curator mcp</dt>
            <dd>Runs the stdio MCP server (remember/recall/forget/get_profile).</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">curator status</dt>
            <dd>Prints resolved config and probes the Supermemory Local server.</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">curator tags</dt>
            <dd>Lists container tags found in Supermemory Local, with a document count each.</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">curator sync [--raw|--review|--commit]</dt>
            <dd>Pulls data from connected agentic sources into Supermemory Local.</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">curator connect &lt;source...&gt;</dt>
            <dd>Wires up a Coral source (github, linear, slack, ...).</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">curator ui [--port]</dt>
            <dd>Serves this governance console.</dd>
          </div>
        </dl>
      </section>
      <section>
        <h3 className="mb-2 font-display text-base text-ink">MCP tools</h3>
        <dl className="space-y-2">
          <div>
            <dt className="font-mono text-ink">remember</dt>
            <dd>Stores a new memory under a container tag.</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">recall</dt>
            <dd>Semantic search over stored memories.</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">forget</dt>
            <dd>Deletes matching memories. Dry-run by default — deletion requires an explicit opt-out.</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">get_profile</dt>
            <dd>Returns the static/dynamic profile derived from stored memories.</dd>
          </div>
        </dl>
      </section>
      <section>
        <h3 className="mb-2 font-display text-base text-ink">Console tabs</h3>
        <dl className="space-y-2">
          <div>
            <dt className="text-ink">Home</dt>
            <dd>Overview stats for the active container tag.</dd>
          </div>
          <div>
            <dt className="text-ink">Memories</dt>
            <dd>Browse stored memories, with version-chain relations where available.</dd>
          </div>
          <div>
            <dt className="text-ink">Review</dt>
            <dd>Approve or decline low-confidence inferred memories (only shown when the server supports it).</dd>
          </div>
          <div>
            <dt className="text-ink">Forget</dt>
            <dd>Always previews matching memories before any deletion.</dd>
          </div>
          <div>
            <dt className="text-ink">Graph</dt>
            <dd>Visualizes documents and their memories.</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Wire into `App.tsx`**

In `src/ui/app/src/App.tsx`, make these three changes:

1. Add the import, alongside the other component imports:

```ts
import { DocsView } from "./components/DocsView.js";
```

2. Add `"docs"` as the last entry in the `tabs` array:

```ts
  const tabs = [
    { id: "home", label: "Home" },
    { id: "memories", label: "Memories" },
    ...(reviewSupported ? [{ id: "review", label: "Review" }] : []),
    { id: "forget", label: "Forget" },
    { id: "graph", label: "Graph" },
    { id: "docs", label: "Docs" },
  ];
```

3. Add the Docs panel, right after the existing `{active === "graph" ? <GraphView tag={tag} /> : null}` line:

```tsx
      {active === "docs" ? (
        <Card title="Docs">
          <DocsView />
        </Card>
      ) : null}
```

- [ ] **Step 5: Update the existing `App` tab-shell test**

In `test/ui-components.test.tsx`, update the first test in `describe("App tab shell", ...)` (from Task 5) to also assert the Docs tab appears:

```tsx
  it("renders the tab bar with Home, Memories, Forget, Graph, and Docs tabs", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Home");
    expect(html).toContain("Memories");
    expect(html).toContain("Graph");
    expect(html).toContain("Forget");
    expect(html).toContain("Docs");
  });
```

(Only the test title and the added `expect(html).toContain("Docs");` line change — the other two tests in that block stay as Task 5 left them.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run test/ui-components.test.tsx`
Expected: PASS

- [ ] **Step 7: Run full suite, both typechecks, and both builds**

Run: `pnpm test` → Expected: all PASS
Run: `npx tsc --noEmit -p tsconfig.json` → Expected: no output
Run: `npx tsc --noEmit -p src/ui/app/tsconfig.json` → Expected: no output
Run: `pnpm build && pnpm run build:ui` → Expected: both succeed

- [ ] **Step 8: Commit**

```bash
git add src/ui/app/src/components/DocsView.tsx src/ui/app/src/App.tsx test/ui-components.test.tsx
git commit -m "feat: Docs tab adds an in-app CLI/MCP/tab reference"
```

---

### Task 7: Live verification + docs

**Files:**
- Modify: `docs/api-verification.md`, `docs/usage.md`, `docs/progress.md`

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: no code. Records live findings.

**This task is verification-first: run the real thing before writing a word about it. Per this project's established pattern, run this task directly (not via a fresh subagent) — it needs the live WSL Supermemory server and a real browser, neither of which a subagent has access to.**

- [ ] **Step 1: Build and start the real server + console**

```bash
pnpm build && pnpm run build:ui
node dist/cli.js status
```
Expected: `Server: reachable (HTTP 200)`.

- [ ] **Step 2: Verify `curator tags` against the live server**

```bash
node dist/cli.js tags
```
Expected: a table listing every real container tag currently in the Supermemory Local install (e.g. `src_github`, `curator_default`, `curator_test` if present), each with a real document count. Record the actual output.

- [ ] **Step 3: Verify `GET /api/tags` end-to-end**

```bash
node dist/cli.js ui --port 4141 &
sleep 2
curl -s http://localhost:4141/api/tags
```
Expected: `{"tags":[...]}` matching Step 2's CLI output.

- [ ] **Step 4: Verify in the browser**

Open `http://localhost:4141`:
1. Confirm the **Home** tab is active by default and shows real stats (tag count, memory count for the current tag, Review support).
2. Type a partial tag name into the container-tag field and confirm the browser's native dropdown suggests matching known tags; confirm you can still type/submit a tag not in the list.
3. Click through **Memories**, **Review**, **Forget**, **Graph** — confirm nothing regressed from the previous branch's restyle.
4. Click the **Docs** tab and confirm the CLI/MCP/tab reference renders.

Record what was actually observed — do not claim more than what was seen on screen.

- [ ] **Step 5: Record findings in `docs/api-verification.md`**

Add a new `## 15. Container tag discovery (2026-07-17)` section covering:
- Confirmation that `GET /v3/container-tags` returns `404` (no native list-tags endpoint).
- Confirmation that `POST /v3/documents/list` with no `containerTags` filter returns documents across every tag, each with its own `containerTags[]`.
- Confirmation that `{limit, page}` pagination works on that endpoint, with the real `totalPages` value observed.
- The real tag list + counts observed in Step 2, as evidence this actually works end-to-end.

- [ ] **Step 6: Update `docs/usage.md`**

- Add `curator tags` to the CLI command reference (wherever `status`/`sync`/`connect`/`ui` are documented).
- In the `## 9. curator ui` section: update the tab list to include Home and Docs; note the container-tag field is now a search+dropdown backed by `GET /api/tags`, with free-text still always accepted.

- [ ] **Step 7: Update `docs/progress.md`**

Add a commit row for this feature (following the existing table's style) and update the test-count total (`pnpm test`'s real output). In "What works right now", add a line for tag discovery with what was actually observed in Step 2-4.

- [ ] **Step 8: Commit**

```bash
git add docs/api-verification.md docs/usage.md docs/progress.md
git commit -m "docs: record live tag-discovery verification"
```
