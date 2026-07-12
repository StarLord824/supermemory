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

`~/.supermemory/env` is expected to hold `SUPERMEMORY_API_KEY` (exact variable name **UNVERIFIED —
confirm by inspecting the real file on Linux**, per `docs/implementation-plan.md` §1 step 2). Never
print or commit its contents.
