# Container tag discovery + Home/Docs tabs — Design

## Context

Two gaps in the console/CLI shipped by the previous feature (`feat/console-graph`, merged):

1. **Container tags are entered blind.** Every panel (Memories, Review, Forget, Graph) reads from
   a single free-text tag input in `App.tsx`'s header, defaulting to `curator_default`. Nothing in
   the CLI or UI tells the user what tags actually exist in their Supermemory Local install — they
   have to already know (or guess) a tag name like `src_github`.
2. **No Home or Docs tab.** The console jumps straight into data panels with zero orientation —
   no welcome/overview, and no in-app reference for what the CLI commands or MCP tools do.

**Verified before this design, not assumed** (live against the running `supermemory-server`
v0.0.5 on `localhost:6767`):
- There is **no dedicated "list all container tags" endpoint.** `GET /v3/container-tags` → `404`.
  `GET /v3/container-tags/{tag}` returns metadata for one *already-known* tag (`200` for
  `src_github`) but can't enumerate tags you don't already know.
- `POST /v3/documents/list` called with **no `containerTags` filter** returns documents across
  **every** tag (confirmed: returned documents tagged both `src_github` and `curator_test` in one
  unfiltered call), each carrying its own `containerTags: string[]`. This is the only real path to
  deriving the full tag set — a derived list, not something the server exposes directly.
- `/v3/documents/list` supports page-based pagination (`{limit, page}` in the request body;
  response `pagination: {currentPage, totalItems, totalPages, limit}`) — confirmed via a real
  `page:1` request. Needed since deriving *all* tags requires walking every page, not just the
  first.

## Decisions (from user Q&A)

1. **CLI surface:** new `curator tags` command — not an extension of `curator status`, not
   interactive-menu-only. Scriptable, discoverable, doesn't bloat existing output.
2. **UI tag selection:** replace the free-text input with a search+dropdown (`TagPicker`) that
   suggests known tags as you type, but **still accepts submitting an arbitrary tag not in the
   list** — required for a fresh install with zero synced data yet, or a tag the user knows exists
   but Curator hasn't seen.
3. **Home tab content:** an overview dashboard — welcome blurb plus live stats reusing data the
   other tabs already fetch (total container tags found, memory count for the active tag, whether
   Review is supported on this server). Becomes the **default** active tab.
4. **Docs tab content:** a curated, hand-written in-app reference (CLI commands, MCP tools, tab
   descriptions, the dry-run safety note) — not a live-rendered copy of `docs/usage.md`. No new
   markdown-rendering dependency; deliberately terser than the developer-facing docs.

## Architecture

### Backend: deriving the tag list

New `listContainerTags(config)` in `src/supermemory/ops.ts` (the sole file allowed to name
Supermemory endpoint paths, per project rule). Calls `POST /v3/documents/list` with no
`containerTags` filter, paging through results (`page` 1..N) until `currentPage >= totalPages`,
capped at a hard bound (10 pages / up to 2000 documents) so a very large install can't turn one
request into an unbounded loop. Deduplicates every document's `containerTags[]` into a sorted
list, counting documents per tag along the way (the count falls out of the same pass — no extra
calls). Returns `{ tags: Array<{ tag: string; documentCount: number }> }`.

Carries the same SOURCE-comment convention as every other `ops.ts` function, and documents
plainly (in the comment and in `docs/usage.md`) that this is a **derived** list, not a native
Supermemory capability — so nobody later assumes a `GET /v3/container-tags` list endpoint exists.

### New route

`GET /api/tags` in `src/ui/server.ts`, delegating to `listContainerTags`. Same shape as every
other route in that file (JSON in, JSON out, errors caught by the handler's existing top-level
try/catch — no new error handling needed).

### CLI: `curator tags`

New command in `src/cli.ts`. Prints a simple table: tag name, document count, sorted
alphabetically by tag. No flags in this version — scope stays to "show me what exists."

### Frontend: `TagPicker`

New component in `src/ui/app/src/components/ui.tsx` (alongside `Card`/`Badge`/`TabBar`),
replacing the plain `<input data-testid="tag-input">` in `App.tsx`'s header. Behavior:
- Fetches `/api/tags` once on mount via a new `fetchTags()` in `api.ts`.
- As the user types, filters the fetched list case-insensitively (substring match) and shows a
  dropdown of matches with each tag's document count.
- Selecting a suggestion (click or Enter while highlighted) sets the active tag.
- The typed text is **always** a valid submission on its own (Enter with no suggestion
  highlighted, or blur) — never blocks entering a tag that isn't in the fetched list yet.
- Basic keyboard nav: Up/Down to move highlight, Enter to select/submit, Escape to close the
  dropdown without changing the tag.

**Testing caveat, stated plainly rather than glossed over:** this project's component tests use
`react-dom/server`'s `renderToStaticMarkup` — there is no jsdom or interaction-testing library
installed anywhere in the codebase. `TagPicker`'s tests will verify static structure (dropdown
options render from a fixture, the current value reflects in the input) but cannot exercise real
keystrokes, clicks, or focus/blur. This is consistent with every existing component test in this
project, not a new gap introduced by this feature.

### New Home tab (becomes the default)

New `HomeView.tsx`. Shows a short welcome blurb plus three live stats, each sourced from data the
app already fetches or a fetch this feature adds:
- Total container tags found (`/api/tags`'s length).
- Memory count for the currently active tag (already in `App.tsx`'s `memories` state).
- Whether the Review queue is supported on this server (already in `App.tsx`'s `reviewSupported`
  state).

`App.tsx`'s `useState("memories")` default becomes `useState("home")`; the tab-fallback guard
added in the previous branch's review pass (`tabs.some(...) ? activeTab : "memories"`) updates its
fallback target to `"home"` too, so it stays consistent with the new default.

### New Docs tab

New `DocsView.tsx` — static JSX, no fetch, no new dependency. Content:
- CLI command table: `mcp`, `status`, `sync [--raw|--review|--commit]`, `connect`, `ui`, `tags`
  (this feature), one line each.
- MCP tool table: `remember`, `recall`, `forget` (dry-run-by-default called out explicitly),
  `get_profile`.
- One line per console tab explaining what it's for.
- A short explicit safety note: forget always previews before deleting.

### Tab order

`Home → Memories → Review (conditional) → Forget → Graph → Docs`.

### What's explicitly out of scope

- No CLI flag to filter other commands by tag (nothing currently takes a tag argument except the
  UI header and MCP tool calls — this feature only adds *discovery*, not a new `--tag` flag
  anywhere).
- No caching/refresh button for `/api/tags` — it refetches on each page load, matching how every
  other panel already behaves (no client-side caching layer exists in this app).
- No live-rendering of `docs/usage.md` inside the Docs tab (explicitly rejected in favor of the
  curated version, per the Q&A above).
- No changes to any already-verified Supermemory endpoint, MCP tool, sync flow, or the Graph/
  Memories/Review/Forget panels' existing data logic — this is additive (one new `ops.ts`
  function, one new route, one new CLI command, three new/changed frontend pieces).

## Testing

- `listContainerTags`: mocked-`fetch` unit test in `test/ops.test.ts`, same pattern as every other
  `ops.ts` function — assert the request has no `containerTags` field, assert pagination looping
  (mock a 2-page response, assert two outbound calls and correctly merged/deduped output), assert
  the document-count-per-tag math.
- `GET /api/tags`: real HTTP round-trip test in `test/ui-server.test.ts`, following the existing
  `mockSupermemoryFetch` pattern.
- `curator tags`: no dedicated CLI test — matching the existing convention, where none of `status`,
  `sync`, `connect`, or `ui`'s commander wiring is unit-tested either (only the underlying
  ops/sync/state logic is). The command is a thin wrapper: call `listContainerTags`, print a
  table. Its correctness rides entirely on `listContainerTags`'s own test coverage above.
- `TagPicker`: `renderToStaticMarkup` against a small fixture tag list — dropdown options present,
  selected/typed value reflected in the input. Per the caveat above, no interaction test.
- `HomeView`: `renderToStaticMarkup` against fixture stats — each stat line renders the right
  number.
- `DocsView`: `renderToStaticMarkup` — smoke test that it renders without crashing and contains
  the expected command names (regression guard against a typo breaking JSX).
- `App.tsx`: existing tab-shell test extended to assert `"home"` is the initial active tab and
  that Home's content renders by default (replacing/augmenting whatever currently asserts the
  Memories-tab default, if anything does).

## Open items deferred to implementation-time live verification

- The pagination cap (10 pages / 2000 documents) is a reasonable default for this project's scale,
  not a value confirmed against any documented server limit — worth a comment noting it's a
  self-imposed safety bound, not a server constraint.
- Exact substring-match behavior (e.g. whether `TagPicker` matches against the tag name only, or
  also lets a document count contribute to relevance ordering) will be finalized during
  implementation as a small, low-risk UI-polish decision.
