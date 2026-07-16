# API Verification — Supermemory Local

**Status of this document: UNVERIFIED.** Written blind on Windows with no access to a running
`supermemory-server` binary, Coral, or headless `claude`. Every path/payload below was fetched from
the **hosted** OpenAPI spec (`https://api.supermemory.ai/v3/openapi`) and the hosted docs
(`https://supermemory.ai/docs/...`) on 2026-07-12. None of it has been confirmed against the
**local** binary. `docs/plan.md` and `docs/implementation-plan.md` explicitly warn that the local
binary may differ from what the hosted docs describe — this file exists so that when real
verification happens (see `docs/linux-test-checklist.md`), corrections land in exactly one place:
`src/supermemory/ops.ts`.

Do not treat any row below as confirmed working on Local. Treat it as "best available guess, cite
the source, verify before shipping."

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
- **STATUS: UNVERIFIED — confirm on Linux.** This is the Phase-0 gate item called out most
  prominently in `docs/roadmap.md`: if unsupported on Local, the console's Review Queue tab must be
  omitted entirely (no dead UI), per `docs/implementation-plan.md` §6.

## 8. Review inferred memory — act (approve / decline / undo)

- **Method/path:** `POST /v3/container-tags/{containerTag}/inferred/{memoryId}/review`
- **Doc source:** `https://supermemory.ai/docs/memory-review.md`
- **Request body:** `{action: "approve" | "decline" | "undo"}`
- **Response:** `{id, isInference: boolean, isForgotten: boolean, reviewStatus: "approved" |
  "declined" | null}`
- **Effects (per doc, not confirmed):** `approve` clears the inference flag (memory ranks as
  explicit fact); `decline` sets forgotten flag (removed from search); `undo` restores unreviewed
  inferred state.
- **STATUS: UNVERIFIED — confirm on Linux.**

## 9. Connections (the gap Curator exists to fill)

- **Method/path family:** `/v3/connections` and related (create, configure, list, get, delete, sync,
  fetch resources) — doc index at `https://supermemory.ai/docs/api-reference/connections/`
- **Expected finding:** per `docs/context.md` §3 and `docs/plan.md` §2, this family is documented as
  hosted-only and is **expected to be unimplemented on the local binary**. Confirming this
  unimplemented status (via a 404/501/not-found response) is itself a Phase-0 deliverable — it lets
  the README state the gap precisely rather than assume it.
- **STATUS: UNVERIFIED — confirm on Linux** (specifically: confirm it returns *not implemented*
  rather than silently succeeding or behaving unexpectedly).

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
- To authenticate explicitly, set `SUPERMEMORY_API_KEY=<the printed sm_ key>` (env var, or write it
  into a `~/.supermemory/env` on the machine running Curator). This is the current documented path.
- **Zero-config opportunity (follow-up):** because localhost auto-applies the key, Curator targeting
  `localhost` could skip the key entirely and send unauthenticated requests. That would restore the
  "zero-config" promise (`docs/plan.md` §3) now that we know the env file lacks the SM key. Requires
  `config.ts` to allow a missing key when `baseUrl` is localhost, and the SDK/raw-fetch to omit the
  Authorization header in that case. Not yet built.

The data dir defaults to `./.supermemory/` **relative to the server's cwd** (or `$SUPERMEMORY_DATA_DIR`).
Starting the server from a different directory creates a different data dir and a different API key —
keep the launch cwd stable, or set `SUPERMEMORY_DATA_DIR` explicitly.

Never print or commit the key or the env file contents.
