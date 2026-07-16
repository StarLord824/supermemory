# API Verification — Supermemory Local

**Status: LIVE-VERIFIED as of 2026-07-16** against `supermemory-server` v0.0.5 running in WSL2
Ubuntu, reached from Windows via `localhost:6767`. See **§12** for the authoritative, confirmed
contract of every endpoint Curator calls — it supersedes the hosted-doc guesses in §1–§9 below,
which are kept only for historical context (they were written blind, before any server was
reachable, per `docs/plan.md`/`docs/implementation-plan.md`'s warning that Local may differ from
the hosted docs). `src/supermemory/ops.ts` has been rewritten against §12 directly, via raw `fetch`
against the server's own live OpenAPI spec (`GET /v4/openapi`) — the project no longer imports the
`supermemory` npm SDK, which targets the hosted platform and was never confirmed to route
identically against Local.

If you're reading this to understand what Curator actually calls today, **read §12, not §1–§9.**

---

## 1. Add / update a memory

- **Method/path:** `POST /v3/documents`
- **Doc source:** hosted OpenAPI spec (`https://api.supermemory.ai/v3/openapi`)
- **Request body:** `content` (string, required), `containerTag` (string, optional), `metadata`
  (object, optional), `customId` (string, optional — enables dedup/update-in-place), `taskType`
  (`"memory"` | `"superrag"`, optional), `dreaming` (`"instant"` | `"dynamic"`, optional)
- **Response:** `{id, status}`
- **STATUS: UNVERIFIED — confirm on Linux.** Also confirm whether re-`POST`ing the same `customId`
  upserts, or whether `PATCH /v3/documents/{id}` is required for update-in-place (both exist in the
  hosted spec; local sync idempotency in `sync --raw` depends on this).

## 2. Search / recall

- **Method/path:** `POST /v4/search`
- **Doc source:** `https://supermemory.ai/docs/api-reference/documents/search-documents.md`
- **Request body:** `containerTag` (string, optional, max 100 chars, pattern `^[a-zA-Z0-9_:-]+$`),
  `threshold` (number, default 0.6), `filters` (object, optional — AND/OR, up to 5 nesting levels)
- **⚠️ Open question:** the query-text field name (`q` vs `query`) was truncated in every fetch of
  this doc page during this session. `docs/plan.md` implies a `query` field for the `recall` MCP
  tool. **Must confirm the exact field name against the live server or full OpenAPI spec before
  wiring `ops.recall`.**
- **Response shape:** not visible in the fetched doc excerpt. **UNVERIFIED — confirm on Linux.**
- Note: `docs/plan.md` §5 assumes a `/v3/search` (low-latency) and `/v4/search` (advanced filtering)
  pair both exist. Confirm which one Local exposes, or whether both do.

## 3. Profile

- **Method/path:** `POST /v4/profile`
- **Doc source:** `https://supermemory.ai/docs/api-reference/profiles/get-user-profile.md`
- **Request body:** `q` (string, optional), `containerTag` (string, optional), `threshold` (number
  0–1, optional), `filters` (object, optional, same AND/OR structure as search)
- **Correction vs. spec assumption:** `docs/implementation-plan.md` §3 implies profile is a simple
  GET; the hosted doc says **POST** with a request body. Verify Local matches.
- **Response shape:** not visible in the fetched doc excerpt. **STATUS: UNVERIFIED — confirm on Linux.**

## 4. List memory entries with history (version chains)

- **Method/path:** `POST /v4/memories/list`
- **Doc source:** `https://supermemory.ai/docs/api-reference/content-management/list-memory-entries-with-history.md`
- **Request body:** `containerTags` (string[], required, min 1 item, max 100 chars/tag, pattern
  `^[a-zA-Z0-9_:-]+$`), `filters` (object, optional, same AND/OR structure)
- **Response shape:** doc excerpt truncated before the response schema. Expected (per doc
  description, not confirmed): memory entries with latest versions, update history, source document
  references, version-chain relation labels (`updates`/`extends`/`derives`), `isLatest` flag — all of
  this is **inferred from the endpoint description only, not from an actual response body.**
- **STATUS: UNVERIFIED — confirm on Linux.** This is a Phase-0 gate item: if this endpoint doesn't
  work on Local as documented, the console's memory browser degrades to latest-entries-only (no
  version chains), per `docs/roadmap.md` Phase 0 gate decision.

## 5. Forget a single memory

- **Method/path:** `DELETE /v4/memories`
- **Doc source:** `https://supermemory.ai/docs/api-reference/content-management/forget-a-memory.md`
- **Request fields:** `id` (string, required — memory entry id, e.g. `mem_abc123`), `containerTag`
  (string, required), `reason` (string, optional)
- **Response:** `200` with `{id, forgotten: true}` — soft delete (memory marked forgotten, not
  permanently deleted)
- **STATUS: UNVERIFIED — confirm on Linux.**

## 6. Forget memories matching a prompt/query (agentic mass-forget)

- **Method/path:** `POST /v4/memories/forget-matching`
- **Doc source:** `https://supermemory.ai/docs/api-reference/content-management/forget-memories-matching-a-promptquery.md`
- **Request body:** `query` (string, 1–2000 chars, required — natural-language instruction like
  "forget everything about Project Titan", or a bare topic), `containerTag` (string, max 100 chars,
  required), `dryRun` (boolean, **server-side default `false`**), `threshold` (number 0–1, default
  0.5), `maxForget` (integer 1–500, default 100), `reason` (string, optional)
- **Dry-run response:** `{dryRun: true, count: number, forgetBatchId: null, summary: string,
  candidates: [{id, memory, score}]}`
- **⚠️ Critical safety note:** the server's own default for `dryRun` is **`false`**. Per
  `docs/plan.md` and `docs/implementation-plan.md`, Curator's `forget` MCP tool and console must
  force `dryRun: true` unless the caller explicitly passes `dryRun: false` — this is a Curator-level
  safety default, not the server's. `ops.forgetByPrompt` must never forward a caller's *absence* of
  `dryRun` as `false`.
- **STATUS: UNVERIFIED — confirm on Linux**, including whether Local implements this endpoint at all
  (it is described as "agentic" and may be a hosted-only orchestration on top of embeddings that
  Local's simpler engine doesn't replicate — this is exactly the kind of gap Phase 0 must catch).

## 7. Review inferred (low-confidence) memories — list

- **Method/path:** `GET /v3/container-tags/{containerTag}/inferred`
- **Doc source:** `https://supermemory.ai/docs/memory-review.md`
- **Response:** `{memories: [{id, memory, parentCount, createdAt, updatedAt, metadata}], total}`
- **STATUS: CONFIRMED LIVE 2026-07-16 — this section's earlier conclusion in §11/§12 that it was
  "absent" was WRONG.** `GET /v3/container-tags/curator_default/inferred` against
  server-v0.0.5 returns `200 {"memories":[],"total":0}` — an exact match to the doc-based guess,
  called directly against port 6767 with a valid Bearer token (bypassing Curator's own code
  entirely, to rule out a client-side bug). **Root cause of the earlier wrong conclusion: this
  server's live `/v4/openapi` spec does not document every route it actually serves** — the path
  is real and functional even though it's absent from the spec. Lesson: an OpenAPI spec's absence
  is not proof a route doesn't exist; only a direct request against the real path is proof.
  The console's Review Queue tab should render for this server (0 items currently, since nothing
  has been passively inferred at low confidence yet — Curator's own `remember` calls are explicit,
  not inferred).

## 8. Review inferred memory — act (approve / decline / undo)

- **Method/path:** `POST /v3/container-tags/{containerTag}/inferred/{memoryId}/review`
- **Doc source:** `https://supermemory.ai/docs/memory-review.md`
- **Request body:** `{action: "approve" | "decline" | "undo"}`
- **Response:** `{id, isInference: boolean, isForgotten: boolean, reviewStatus: "approved" |
  "declined" | null}`
- **Effects (per doc, not confirmed):** `approve` clears the inference flag (memory ranks as
  explicit fact); `decline` sets forgotten flag (removed from search); `undo` restores unreviewed
  inferred state.
- **STATUS: route existence UNVERIFIED with a real memoryId** (no inferred memories exist yet to
  test against — §7's list is empty). Given §7 was live-confirmed despite being spec-absent, this
  sibling route should be assumed real too pending a direct test once an inferred memory exists.

## 9. Connections (the gap Curator exists to fill)

- **Method/path family:** `/v3/connections` and related (create, configure, list, get, delete, sync,
  fetch resources) — doc index at `https://supermemory.ai/docs/api-reference/connections/`
- **Expected finding:** per `docs/context.md` §3 and `docs/plan.md` §2, this family is documented as
  hosted-only and is **expected to be unimplemented on the local binary**. Confirming this
  unimplemented status (via a 404/501/not-found response) is itself a Phase-0 deliverable — it lets
  the README state the gap precisely rather than assume it.
- **STATUS: CONFIRMED 2026-07-17.** `GET /v3/connections` with a valid Bearer token against the
  live server returns `404 Not Found`. Given §7 taught us `/v4/openapi`'s silence doesn't prove
  absence, this was checked with a **direct request** rather than inferred from the spec — genuine
  confirmation, not assumption. **Curator's core positioning claim ("Local has no connectors") is
  now verified, not just documented.**

---

## 10. Corrections from the installed `supermemory` npm SDK (v3.14.0)

While wiring `src/supermemory/ops.ts`, I inspected the actual shipped type definitions in
`node_modules/supermemory/resources/*.d.ts` (not just the hosted doc pages above — this is the
real, versioned SDK contract). This is stronger evidence than the doc-page fetches above where
noted, but it is a **hosted SDK**; whether Local implements the same resources is still
**UNVERIFIED**.

- **`client.search.memories({q, ...})`, `client.search.documents({q, ...})`, `client.search.execute({q, ...})`
  all exist and confirm the query field name is `q`, not `query`.** This resolves the open question
  in §2 above. Use `client.search.memories` for `ops.recall` (its doc comment says "Search memory
  entries - Low latency for conversational", matching `docs/plan.md`'s description of `recall`).
- **`client.memories.forget(body: {containerTag, id?, content?, reason?})`** exists for forgetting a
  **single** memory (by id or exact content match) — this is the real shape of §5 "forget a single
  memory", but note it is **not** a `DELETE /v4/memories` call from the SDK's perspective; the SDK
  method wraps whatever the real transport is. Use this for `ops.forgetById`.
- **`client.documents.add(body: DocumentAddParams)` and `client.memories.add(...)` both exist** for
  storing content. Use `client.documents.add` for `ops.remember` (matches the `POST /v3/documents`
  citation in `docs/plan.md` §6 and `docs/implementation-plan.md` §3).
- **`client.memories.list(body: {containerTags, filters, includeContent, ...})`** exists and is the
  closest match for §4 "list memory entries with history" — but its documented response
  (`MemoryListResponse`) shows `id/title/summary/status/type/metadata/createdAt/updatedAt/content`
  and does **not** show version-chain relation fields (`updates`/`extends`/`derives`) or `isLatest`
  in the SDK's type definitions. **STATUS: UNVERIFIED whether the history/version-chain data is
  present in the real response or requires a different call** — confirm on Linux; if absent, the
  console's memory browser degrades to latest-entries-only per the Phase 0 gate in `docs/roadmap.md`.
- **No `profile` resource and no `inferred`/`review` resource exist anywhere in this SDK version.**
  Neither `/v4/profile` (§3) nor the review-queue endpoints (§7, §8) nor the agentic mass-forget
  endpoint (§6, `/v4/memories/forget-matching`) are covered by any typed SDK method. **This means
  `ops.getProfile`, `ops.listInferred`, `ops.reviewInferred`, and `ops.forgetByPrompt` must all use a
  raw authenticated `fetch` (in `src/supermemory/client.ts`) against the best-guess paths from §3/§6/§7/§8
  above — they cannot be typed against the SDK and are the highest-risk unverified surface in the
  whole project.** This raises real doubt about whether these hosted-doc-only endpoints exist on
  Local at all; Phase 0 on Linux must probe them directly and be prepared to degrade the console
  per the gate decision.

## 11. Windows verification session — Coral + agent runtimes (2026-07-12)

Coral, `claude`, and `agy` turned out to be installed on the Windows build machine after all, so
the tooling layer was verified live here. **Supermemory Local remains unverified** (no binary on
this machine) — sections 1–9 still need the Linux pass.

**Coral 0.4.1 — VERIFIED live:**
- `coral sql "<query>" --format json` works and prints a plain JSON array — exactly what
  `queryCoralGithubIssues` in `src/sync/raw.ts` expects. The exact `buildGithubQuery` shape
  (columns `number, title, state, body, html_url, updated_at`, `WHERE owner/repo/updated_at >`)
  executes against the live `github.issues` table; `github.pulls` requires a `state` filter
  (`state='all'` works) and returned real rows.
- `coral source add --interactive <name>` flag confirmed. Non-interactive mode reads inputs from
  env vars matching each input key (github needs `GITHUB_TOKEN`); credential refresh via
  `GITHUB_TOKEN=$(gh auth token) coral source add github` re-validated the source.
- `coral mcp-stdio` confirmed: MCP handshake lists 5 tools — `sql`, `list_catalog`,
  `search_catalog`, `describe_table`, `list_columns` (sync prompt references these names).

**Curator MCP server — A1 VERIFIED over real stdio:** `node dist/cli.js mcp` handshakes and lists
exactly `remember`, `recall`, `forget`, `get_profile` (previously only proven via in-memory
transport).

**claude 2.1.207 — VERIFIED live:** `-p`, `--mcp-config <files...>`, `--strict-mcp-config`,
`--allowedTools` (server-scoped `mcp__coral` / `mcp__curator` form), `--output-format json`.
**`--max-turns` no longer exists** and was removed from `buildAgentArgs`. JSON output is an
envelope; the agent's text is in the `result` field (handled by `extractAgentText`). End-to-end
run: headless claude called Coral's `sql` tool, returned real PR rows and the `CURSOR=` trailer,
zero permission denials.

**agy 1.1.1 (Antigravity CLI) — VERIFIED live:** `-p/--print` (plain-text output),
`--dangerously-skip-permissions`, `--print-timeout` (default 5m). **It has NO `--mcp-config` and
NO `--output-format`** — MCP servers are read from `~/.gemini/antigravity-cli/mcp_config.json`
(same `mcpServers` schema; `writeAgyMcpConfig` merges Curator in while preserving user entries).
End-to-end run: identical real PR data + `CURSOR=` trailer via Coral MCP.

**Still open (Linux/live-Supermemory only):** everything in §1–§9, plus the full write path
(agent → curator `remember` → Supermemory Local) and acceptance tests A2–S1.

**Update 2026-07-16: the item above is now resolved — see §12.**

## 12. Supermemory Local — full contract, LIVE-VERIFIED against server-v0.0.5 (2026-07-16)

Installed and ran real `supermemory-server` v0.0.5 in WSL2 Ubuntu (Gemini API key for
embeddings/summaries; local `Xenova/bge-base-en-v1.5` embeddings, 768d), reached from Windows over
`localhost:6767` (WSL2 forwards it transparently). Pulled the server's **own live OpenAPI spec**
from `GET /v4/openapi` — this is ground truth for *this exact running binary*, not the hosted docs.
`src/supermemory/ops.ts` was rewritten against this section directly, dropping the `supermemory`
npm SDK entirely (it targets the hosted platform; nothing confirmed it routes identically on
Local). Every call below was additionally proven with a real end-to-end run through Curator's own
MCP server (see the "End-to-end proof" subsection).

### Credentials — corrected understanding

- `~/.supermemory/env` holds the **LLM provider key** (`GEMINI_API_KEY` in this install), not a
  Supermemory API key. See "Credentials note" below — unchanged from the 2026-07-16 correction.
- The real Supermemory API key is **auto-generated at first boot** and printed in the startup
  banner (`sm_<orgid>_<secret>`), tied to the server's data directory (defaults to cwd-relative
  `./.supermemory/` unless `SUPERMEMORY_DATA_DIR` is set — keep the launch directory stable).
- The server auto-accepts **unauthenticated** requests on localhost (per its own boot message) —
  Curator does not currently rely on this and still sends `Authorization: Bearer <key>` on every
  call, since that's what a non-localhost or multi-key setup would require anyway.

### Endpoint contracts (method, path, request, response — all CONFIRMED)

| Ops function | Method + path | Request body | Response |
|---|---|---|---|
| `remember` | `POST /v3/documents` | `{content(required), containerTag?, customId?, metadata?, taskType?, dreaming?}` | `{id, status}` |
| `recall` | `POST /v4/search` | `{q(required), containerTag?, threshold?(default 0.6), limit?(default 10, max 100), include?, rerank?, aggregate?, searchMode?(default 'memories')}` | `{results:[{id, memory?, chunk?, metadata, updatedAt, similarity, version, context?}], total, timing}` |
| `getProfile` | `POST /v4/profile` | `{containerTag(required), q?, threshold?, filters?, include?, buckets?}` | `{profile:{static[], dynamic[], buckets:{}}, searchResults?}` |
| `forgetById` | `DELETE /v4/memories` | `{id?, content?, containerTag(required), reason?}` | `{id, forgotten}` |
| `forgetByPrompt` | `POST /v4/memories/forget-matching` | `{query(required), containerTag(required), dryRun?(server default **false**), threshold?(default 0.5), maxForget?(default 100, max 500), reason?}` | `{dryRun, count, forgetBatchId, summary, candidates?[]/forgotten?[]}` |
| `listEntriesWithHistory` | `POST /v4/memories/list` | `{containerTags(required array), filters?, limit?, order?, page?, sort?}` | `{memoryEntries:[...], pagination}` — **field is `memoryEntries`, not `memories`** |
| `listInferred` | `GET /v3/container-tags/{tag}/inferred` | — | `{memories:[...], total}` — **CONFIRMED live 2026-07-16 (real 200), despite being absent from the `/v4/openapi` spec** — see the update below the table. `reviewInferred` (the action endpoint) is presumed real too but not yet called against a real memoryId. |
| `checkHealth` | `GET /` (root) | — | 200 HTML landing page. **No dedicated `/health` path exists** (confirmed absent from the spec) — root is the best liveness signal. |
| — (confirmed absent) | `/v3/connections` family | — | Absent, as expected — this is the gap Curator exists to fill (docs/context.md §3). |

Corrections vs. the earlier hosted-doc guesses in §1–§9:
- **`/v3/search` is document-chunk search, NOT memory search.** `recall` must use `/v4/search`
  ("Search memory entries — Low latency for conversational"), which was the original intent.
- `listEntriesWithHistory`'s response key is **`memoryEntries`**, not `memories` — this was wrong
  everywhere in the code (`ops.ts`, the console frontend) and has been fixed.
- Version-chain data is real and rich: each entry has `isLatest`, `isForgotten`, `isStatic`,
  `isInference`, `memoryRelations` (keyed by related-memory-id → `updates`/`extends`/`derives`),
  and a full `history[]` array of prior versions. The console can show real relations, not just
  latest-only.
- `forgetByPrompt`'s server-side `dryRun` default really is `false` (confirmed) — Curator's
  MCP/console layers correctly override this to `true` unless the caller explicitly opts out.
- Two document/memory operations exist that Curator doesn't currently use but are available if
  needed later: `GET/PATCH/DELETE /v3/documents/{id}` (single-document ops, delete by id or
  customId) and `POST /v4/memories` (create memories directly, bypassing the extraction pipeline).

**⚠️ Important caveat on this whole section: the live `/v4/openapi` spec is not exhaustive.**
`listInferred`'s path (`/v3/container-tags/{tag}/inferred`) was absent from that spec yet returns
a real `200` when called directly — see the update further below. Treat every "confirmed ABSENT"
claim derived only from the spec's path list as *unconfirmed*, not proven absent, unless it was
also independently verified with a direct request. The spec is reliable for confirming a path's
request/response *shape* once you know it exists, but not reliable for proving non-existence.

### End-to-end proof (via Curator's own MCP server, real stdio, real server)

1. **remember → recall**: stored `"...the hackathon deadline is July 13."` via the `remember` MCP
   tool. The server's extraction pipeline distilled it to `"The hackathon deadline is July 13."`
   with `temporalContext.eventDate: ["2025-07-13"]` inferred automatically. `recall` for "hackathon
   deadline" returned it with `similarity: 0.91`. (This is acceptance test **A2**.)
2. **forget dry-run**: `forget` with `mode:"prompt"`, target "hackathon deadline", default
   `dryRun` → returned `dryRun:true`, the correct candidate with a similarity score, zero deletion.
   (This is acceptance test **A3**'s preview half — confirming `dryRun:false` actually deletes is
   the one step deliberately not run yet, to avoid mutating state during this verification pass.)
3. **status**: `curator status` reports `Server: reachable (HTTP 200)` against the real server.

**Update 2026-07-16 (later same day): `dryRun:false` deletion CONFIRMED live.** Ran `forget` with
`mode:"prompt"`, target "hackathon deadline", `dryRun:false` against the same memory staged in the
A2 proof above. Response: `{dryRun:false, count:1, forgetBatchId:"vjEW3xWLvW99YcnSfFuVAM",
forgotten:[{id, memory, score}]}` — a real `forgetBatchId` was assigned (null on dry-run, per the
confirmed contract) and the memory was actually removed. Verified via a follow-up `recall` for the
same query, which returned `{results:[], total:0}`. **Acceptance test A3 is now fully closed** —
both the dry-run preview and the real deletion are proven against the live server, not mocked.

**Update 2026-07-16 (agentic sync, real run): `customId` character set CONFIRMED via a real 400.**
Running `curator sync --review --instruction "only merged PRs..."` against real GitHub PR data via
Coral produced a real agent decision to store 12 memories, correctly summarized and filtered (38 of
50 merged PRs skipped as routine noise). On `sync --commit`, the first item failed:

```
POST /v3/documents → 400 {"error":[{"path":["customId"],
  "message":"Must contain only alphanumeric characters, hyphens, underscores, and colons
             (no spaces or other special characters)"}]}
```

The agent's customId was `github:pr:medullabs-code/Medullabs#188` — the `owner/repo#number`
native-id form contains `/` and `#`, both rejected. **Fixed two ways:** (1) `ops.remember` now
sanitizes any customId through `sanitizeCustomId()` (replaces disallowed characters with `-`)
before sending, so one malformed id from an agent, raw-sync mapping, or manual staging can never
fail an entire batch commit; (2) `src/sync/prompt.ts`'s protocol now explicitly tells the agent the
allowed character set and to self-sanitize `owner/repo#number`-style ids going forward. Both fixes
are covered by new tests (`ops.test.ts`, `prompt.test.ts`).

**Update 2026-07-16 (commit retry): succeeded.** Re-ran `sync --commit` after the sanitizer fix —
all 12 staged memories committed to Supermemory, cursor advanced to `2026-07-15T05:57:21Z`.
Confirmed via `recall` for one of them (the "Consumer Services" PR #188 decision): the server's
extraction pipeline had split it into two atomic memories (the decision, and the prior state it
replaced), both returned with similarity scores. Acceptance tests **C1** (idempotent raw sync) was
skipped by agreement in favor of exercising the agentic write path directly, which is now proven.

**Update 2026-07-16 (console, B1 in progress): the review-queue "confirmed absent" conclusion in
§7 above was WRONG — see §7's correction.** `GET /api/review?tag=curator_default` against the
running console backend returned `{supported:true, memories:[], total:0}`, which looked like a
possible client-side bug at first. Direct verification against port 6767 (bypassing Curator's own
code) confirmed the server genuinely returns `200 {"memories":[],"total":0}` for that path — it is
real and functional. The root cause: **the server's own `/v4/openapi` spec does not document every
route it serves.** This reverses the Phase-0 gate decision: the console's Review Queue tab should
render on this server (currently empty, since Curator's `remember` calls are explicit, not
passively inferred, so nothing has landed in the low-confidence queue yet).

Also confirmed via direct `GET /api/memories?tag=src_github`: all 12 committed memories present
with correct `memoryEntries` shape and pagination (`{currentPage:1, limit:10, totalItems:16,
totalPages:2}` — 16 total because the extraction pipeline split some PR summaries into multiple
atomic memories, e.g. PR #171 became 4 separate memories). This is B1's memory-browser half,
genuinely proven.

**Update 2026-07-17: B1 fully closed, through the actual browser.** With the server restarted
(same data directory, same key, same 16 memories persisted across restart — confirms the encrypted
local storage survives a restart correctly) and a real WSL/Windows-collision credentials gotcha
resolved (see below), walked through `curator ui` in a live browser end to end:

- Memory browser with tag `src_github` showed all 10 (paginated) real synced memories.
- Review Queue section rendered with its correct empty state ("No inferred memories awaiting
  review") — confirms the §7 reversal is correct in the actual UI, not just the API.
- Forget console: typed "AOI upload logo optional" → Preview → Confirm deletion → the two matching
  PR #171 memories ("refactored the AOI upload logic...", "updated UI labels...") were verified
  gone from a subsequent reload of the memory browser. **This is a real, human-confirmed deletion
  through the actual console UI — B1 is now fully proven, not just via curl/MCP tool calls.**

**Also confirmed 2026-07-17: `/v3/connections` genuinely returns `404`** via a direct authenticated
request (not inferred from the spec, learning from the §7 near-miss). **Curator's core positioning
claim — "Supermemory Local has no connectors, this is the gap Curator fills" — is now verified,
not assumed.**

**New operational finding (credentials, not an API contract):** restarting `supermemory-server`
from the same directory reuses the same data dir and key, as expected — but the plaintext `env`
file Curator's `config.ts` reads from `~/.supermemory/env` had been consumed: the server appears
to treat its own data directory's `env` file as a secret to encrypt (`env.enc` appeared, plaintext
`env` vanished). Since the server's data dir defaults to cwd-relative `./.supermemory/`, and this
server has always been launched from the Windows home directory (`/mnt/c/Users/MY NOTEBOOK` in
WSL, which *is* `~` on the Windows side), the server's data directory and Curator's config lookup
directory are the same path — a real collision, not a hypothetical one. **Recommended fix:**
don't rely on a Curator-owned `env` file living inside `~/.supermemory` at all; set
`SUPERMEMORY_API_KEY` as a persistent env var instead (`setx` on Windows), which `config.ts`
already prefers over the file. Longer-term, launching the server with an explicit
`SUPERMEMORY_DATA_DIR` outside `~/.supermemory` would remove the collision entirely, but changing
it now would orphan the existing data directory (and its 16 memories), so this is deferred.

**This closes essentially every acceptance test and positioning claim in the project.** Remaining,
lower-priority items: the review-*action* endpoint (approve/decline/undo, §8) has not been called
against a real memoryId (no inferred memory exists yet to test against — nothing has been
passively inferred at low confidence, since all of Curator's writes are explicit `remember` calls).

## Isolation policy

Every function in `src/supermemory/ops.ts` that calls one of the above endpoints carries an inline
comment of the form:

```ts
// SOURCE: <doc URL used above> — STATUS: UNVERIFIED, see docs/api-verification.md
```

When live verification on Linux confirms or corrects a path, payload field, or response shape:
1. Update the corresponding row in this file (flip STATUS to `VERIFIED` or `CORRECTED`, with the
   real finding).
2. Update only `src/supermemory/ops.ts` (and its tests) — no other file should ever hardcode a
   Supermemory endpoint path or payload field name.

## Credentials note

**CORRECTED 2026-07-16 against server-v0.0.5 (running live in WSL2).** Our assumption was wrong on
two counts:

1. **`~/.supermemory/env` holds the LLM provider key, NOT the Supermemory API key.** The installer
   writes whichever of `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` you picked (used
   for embeddings/summaries). It does **not** contain a `SUPERMEMORY_API_KEY`. So `config.ts`'s
   auto-discovery from that file will not find the key it needs.
2. **The Supermemory API key is auto-generated at first boot**, printed in the startup banner as
   `sm_<orgid>_<secret>`, and tied to the data dir (org id is embedded in the key, so it's stable
   as long as the data dir persists). Critically, the server **auto-applies it for unauthenticated
   localhost requests** — a client on `localhost:6767` that sends *no* Authorization header is
   accepted.

**Implications for Curator:**
- To authenticate explicitly (non-localhost `baseUrl`, or if you just prefer an explicit key), set
  `SUPERMEMORY_API_KEY=<the printed sm_ key>` (env var, or write it into `~/.supermemory/env`).
- **Zero-config: BUILT and VERIFIED live 2026-07-17.** Before writing any code, the auto-auth claim
  was checked directly rather than assumed: `POST /v4/profile` with **no** `Authorization` header
  at all, against `http://localhost:6767`, returned a real `200` with correct data. This matches the
  server's own boot-banner self-description ("the api key above is auto-applied for unauthenticated
  localhost requests") and is reproducible, not a fluke — genuine intended behavior, not an
  oversight to lean on. `config.ts`'s `resolveConfig` now returns `apiKey: undefined` (instead of
  throwing) when no key is found **and** `baseUrl` resolves to a strict localhost hostname
  (`isLocalhost()` — exact match on `localhost` / `127.0.0.1` / `[::1]` via `new URL().hostname`,
  never a substring check, so `localhost.evil.com` or a LAN IP never qualifies). `client.ts`'s
  `rawRequest` omits the `Authorization` header entirely when `apiKey` is unset, rather than
  sending `Bearer undefined`. **Re-verified end-to-end after the code change**, in a shell with
  zero `SUPERMEMORY_API_KEY` set anywhere (no env var, no file): `curator status` reported
  `Server: reachable`, and a full `remember` → `recall` round-trip through the real MCP server
  against the real running binary succeeded with no credentials configured at all. The original
  "zero-config, no secrets to paste" promise (`docs/plan.md` §3) is now actually true for the
  localhost case, which is the default and by far the common one.

The data dir defaults to `./.supermemory/` **relative to the server's cwd** (or `$SUPERMEMORY_DATA_DIR`).
Starting the server from a different directory creates a different data dir and a different API key —
keep the launch cwd stable, or set `SUPERMEMORY_DATA_DIR` explicitly.

Never print or commit the key or the env file contents.
