# Console restyle + real memory graph — Design

## Context

Curator's governance console (`src/ui/app/`) currently has zero styling — plain browser-default
HTML (Times New Roman, unstyled inputs/buttons), verified by screenshot during live testing. The
user wants the console to visually resemble Supermemory's own hosted dashboard, and specifically
wants a real memory graph view using Supermemory's official `@supermemory/memory-graph` React
component — this is explicitly called out as the single highest-value visual for demo-video
judging (a live graph beats a list view in every screenshot), and it's cheap: the component is
official, the console is already React, and `/api/memories` already fetches data the graph needs.

Reference screenshots were provided showing the hosted UI: a dark (near-black) dashboard with
rounded-xl bordered cards, a segmented pill tab bar (Overview / Requests / Memory Graph /
Connectors), a left icon-sidebar (Dashboard/API Keys/Billing/Organization/Settings/Import
Data/Help), stat cards, donut/bar charts, a data table with pill badges, and a full-bleed canvas
graph view with hexagonal nodes, thin connecting edges, and a click-to-open "Memory" detail
popover (memory text, space ID, date, hash). A CSS snippet in one screenshot gave the exact font
stack: `Inter` (sans/body), `Space Grotesk` (display/headings), `JetBrains Mono` (mono/IDs).

This reads as a Tailwind/shadcn-style design system — a well-documented, fast-to-replicate
aesthetic once identified.

**Package verification (done before this design, not assumed):**
- `@supermemory/memory-graph@0.2.3` — real, published, MIT license, `type: module`, one runtime
  dependency (`d3-force@^3`), peer deps `react`/`react-dom >=18` (compatible with this project's
  React 18). Ships a `variant: "console" | "consumer"` prop and a `./mock-data` export for
  fixture-driven dev.
- Its expected input shape is `{documents: DocumentWithMemories[]}` where each document has
  `{id, title, url, documentType, createdAt, updatedAt, summary?, memories: MemoryEntry[]}`. The
  `MemoryEntry` fields (`isLatest`, `memoryRelations`, `version`, `parentMemoryId`, etc.) match
  Curator's existing confirmed `/v4/memories/list` shape almost exactly — but that endpoint
  returns a **flat** memory list with `documentIds: string[]` references, not documents with
  titles. Real document metadata (title, summary, type) requires a **new** API call.
- `POST /v3/documents/list` was re-inspected from the full (previously too-large-to-read) OpenAPI
  dump already on disk (`bin/api/v3_documents_list.json`) — confirmed real response shape:
  `{memories: [{id, title, summary, status, type, url, customId, connectionId, metadata,
  createdAt, updatedAt, content?}], pagination}`. (Yes — this *document*-list endpoint also wraps
  its array in a key literally called `memories`; confirmed from the spec, not a typo.) One
  open item deferred to implementation-time live verification: the `containerTags` request
  param on this specific endpoint is marked `deprecated`/`hidden` in the spec, unlike on
  `/v4/memories/list` where it's the primary confirmed filter — needs a real request to confirm
  whether it still filters, or whether client-side filtering by `customId`/`containerTag`
  metadata is more reliable.

## Decisions (from user Q&A)

1. **Design reference:** user-provided screenshots of the real hosted UI (not a browser-access
   walkthrough — none available in this environment).
2. **Layout:** restructure from one scrolling page into a **tabbed layout** (Memories / Review /
   Forget / Graph), matching the reference's tab-bar pattern. No sidebar clone — Billing/API
   Keys/Connectors nav items don't apply to a local governance console and would read as dead
   padding, not polish.
3. **Graph data fidelity:** fetch **real document titles** via the new `/v3/documents/list` call,
   not synthesized/generic groupings. More faithful to the reference, consistent with this
   project's "verify, don't assume" and "no fabricated data" discipline throughout.
4. **Styling approach:** **Tailwind CSS**, added as a Vite build-time devDependency (zero runtime
   JS shipped). Fastest, most faithful path to a Tailwind/shadcn-style reference; still a single
   devDependency + build step, consistent with the project's "minimal dependencies" spirit for
   the UI. Alternative considered and rejected for this phase: hand-rolled CSS custom properties
   (avoids the new devDependency but meaningfully slower to get pixel-close, and about to get
   more tedious as 4 tab views land at once).
5. **Fonts:** self-hosted via `@fontsource` packages (`@fontsource/inter`,
   `@fontsource/space-grotesk`, `@fontsource/jetbrains-mono`), not a Google Fonts CDN link — keeps
   the console fully offline/local-first, consistent with the project's whole positioning
   ("everything stays on the machine").

## Architecture

### Visual system

- `src/ui/app/tailwind.config.js` + PostCSS wiring into the existing Vite build.
- Tokens: near-black page background (`zinc-950`), card background `zinc-900`-ish with ~8-12%
  white-opacity 1px borders, `rounded-xl` cards, white/`zinc-100` primary text, `zinc-400` muted
  text, blue/green/red accents used sparingly (data viz, graph nodes, destructive actions).
- Typography via `@fontsource`: `font-sans` = Inter (body), `font-display` = Space Grotesk
  (headings), `font-mono` = JetBrains Mono (IDs/hashes/customIds).
- Reusable primitives (as plain Tailwind-classed components, not a component library): Card,
  Badge/Pill, TabBar, IconButton — used across all four tabs for visual consistency.

### Layout restructure (`App.tsx`)

Becomes a tab shell:

```
┌─────────────────────────────────────────┐
│  Curator            [tag: src_github ▾]  │  ← header bar
├─────────────────────────────────────────┤
│  Memories │ Review │ Forget │ Graph      │  ← pill tab bar
├─────────────────────────────────────────┤
│         (active tab's panel)             │
└─────────────────────────────────────────┘
```

- `MemoryBrowser`, `ReviewQueue`, `ForgetConsole` become individual tab panels — restyled with
  the card/pill language, logic unchanged.
- `ReviewQueue`'s existing "render nothing when `supported:false`" behavior now hides its **tab
  entry**, not just in-panel content (no dead tab to click into).
- New `GraphView` tab, rendered full-bleed (no card wrapper) to match the reference's full-canvas
  graph presentation.

### Memory graph data flow

1. **`ops.ts`: new `listDocuments(config, containerTag)`** → `POST /v3/documents/list`. Mirrors
   the existing isolation-boundary pattern (single function, one endpoint, SOURCE comment citing
   the verification). Returns the confirmed `{memories: DocumentRecord[], pagination}` shape
   (internally renamed/typed to avoid confusion with memory-entries — e.g. exported type
   `DocumentSummary`).

2. **New backend route: `GET /api/graph?tag=`** (`src/ui/server.ts`) — calls both
   `listEntriesWithHistory` (existing, confirmed) and the new `listDocuments`, then shapes the
   combined result into `@supermemory/memory-graph`'s expected `{documents: DocumentWithMemories[]}`:
   - Group memory entries by their `documentIds[0]` (primary source document).
   - Attach each group's memories under the matching document's `{id, title, url, documentType:
     type, createdAt, updatedAt, summary}`.
   - Memories with no matching document id (defensive — shouldn't occur given how Curator writes
     data) bucket into a synthetic `{id: "ungrouped", title: "Other memories", ...}` document
     rather than being silently dropped.

3. **Frontend: new `GraphView.tsx`** — fetches `/api/graph?tag=`, renders
   `<MemoryGraph documents={...} variant="console" />` full-bleed. The component's own
   click-node detail popover (content/space/date, per the reference screenshot) is used as-is,
   no custom popover needed.

### What's explicitly out of scope

- No sidebar navigation clone (Billing/API Keys/Organization/Connectors) — not applicable to a
  local single-user console.
- No attempt to replicate the dashboard's stat cards / usage charts (Tokens Processed, Token
  Usage, Request Types) — those reflect hosted-platform billing/usage concepts Curator has no
  analog for. The restyle targets the *visual language*, not a literal feature clone.
- No changes to any already-verified Supermemory endpoint behavior, MCP tools, sync flows, or
  CLI — this is a console-frontend-and-one-new-read-endpoint change only.

## Testing

- `listDocuments`: mocked-`fetch` unit test in `test/ops.test.ts`, same pattern as every other
  `ops.ts` function (assert URL, method, body, and response passthrough).
- `/api/graph` route: real HTTP round-trip test against an ephemeral port in
  `test/ui-server.test.ts`, following the existing `mockSupermemoryFetch` routing-mock pattern
  (outbound Supermemory calls vs. inbound test requests both use `global.fetch` now that there's
  no SDK layer).
- `GraphView`: `renderToStaticMarkup` against fixture data (new
  `src/ui/app/src/fixtures/graph.json`), matching how `MemoryBrowser`/`ForgetConsole` are already
  tested — no attempt to test the upstream package's canvas/d3-force internals.
- Existing `MemoryBrowser`/`ForgetConsole`/`ReviewQueue` component tests: updated for new
  wrapper markup/class names from the restyle, but continue asserting the same behavior (content
  rendering, empty states, dry-run gating) — a pure restyle should not change what they verify.
- Tab-shell behavior (`App.tsx`): a light test confirming the Review tab is absent from the tab
  bar when `supported:false`, and present when `true` — extending the existing coverage of that
  conditional-render logic.

## Open items deferred to implementation-time live verification

- Whether `/v3/documents/list`'s `containerTags` filter (marked deprecated/hidden in the spec)
  actually filters on this server build, or whether the route should fetch broadly and filter
  client-side by `customId` prefix / `containerTag` in metadata instead.
- Exact Tailwind card/badge color values will be tuned against the real running console during
  implementation, not guessed pixel-for-pixel from the compressed reference screenshots.
