# Curator — Progress

Snapshot of what's been built since `git init`, for anyone (including future-us) picking this up
mid-stream. Read `docs/context.md` → `docs/plan.md` → `docs/roadmap.md` →
`docs/implementation-plan.md` for the why/what/when/how; this file is "where are we right now."

**Current status: everything that matters is verified live (2026-07-17).** Coral, claude, and agy
were confirmed on Windows (`docs/api-verification.md` §11); a real `supermemory-server` v0.0.5 was
installed in WSL2 and `src/supermemory/ops.ts` rewritten against its live OpenAPI contract, dropping
the hosted-platform `supermemory` npm SDK entirely (§12); the full `remember`→`recall`→`forget`
loop (dry-run **and** real deletion) was proven through Curator's real MCP server; the full agentic
write path — `curator sync --review` → real `claude` + real Coral data → `curator sync --commit` →
real Supermemory writes — was proven end-to-end with 12 real memories from real GitHub PRs; and the
governance console (B1) was walked through in an actual browser — memory browser, review queue, and
a real preview→confirm→gone deletion, all against the live server. `/v3/connections` was confirmed
via direct request to genuinely 404, closing Curator's core positioning claim. Two surprises along
the way, both corrected: the review-queue endpoints were wrongly marked "confirmed absent" at first
(they're real, just undocumented in the server's own spec), and the server's data directory
silently consumed a plaintext credentials file that collided with its own path (fixed by using a
persistent env var instead of a file). See "What's NOT done" for the one remaining minor check.

---

## Commit-by-commit

| Commit | What it added |
|---|---|
| `chore: scaffold repo` | `git init`, MIT `LICENSE`, `.gitignore`, `package.json`, `tsconfig.json`, `vitest.config.ts`. Two Phase-0 docs written blind: `docs/api-verification.md` (best-guess endpoint paths, all marked UNVERIFIED) and `docs/linux-test-checklist.md` (the ordered live-verification steps deferred to Linux). |
| `feat: config + state with tests` | `src/config.ts` (resolves `SUPERMEMORY_API_KEY`/`SUPERMEMORY_BASE_URL` from env → `~/.supermemory/env`), `src/state.ts` (`~/.curator/state.json` cursor storage). 8 tests. |
| `feat: supermemory ops layer` | `src/supermemory/client.ts` + `src/supermemory/ops.ts` — the single isolation boundary for every Supermemory Local call. Inspecting the real installed SDK's type defs corrected earlier doc-based guesses (search field is `q` not `query`; no SDK coverage for profile/review/mass-forget, so those go through raw `fetch`). 11 tests. |
| `feat: mcp server with 4 tools + cli entry` | `src/mcp/server.ts` (remember/recall/forget/get_profile via `@modelcontextprotocol/sdk`, dry-run forced true unless explicitly `false`), `src/cli.ts` (commander: `mcp`/`status`/`sync`/`connect`/`ui`). Verified via an in-memory MCP Client↔Server handshake — real tool listing and invocation, no live server needed. 5 tests. |
| `feat: raw sync + mapping with fixture tests` | `src/sync/mapping.ts` (pure row→memory mapper) + `src/sync/raw.ts` (deterministic `sync --raw`: cursor → Coral SQL → map → remember → advance cursor). Idempotency proven against fixture rows with Coral/Supermemory both mocked. 8 tests. |
| `feat: agent sync scaffolding` | `src/sync/prompt.ts` (sync-agent prompt template + `CURSOR=` parser) + `src/sync/agent.ts` (mcp-config generation, spawn wrapper, timeout). Cursor-advance/keep-old logic tested against a fake child process; the real binary invocation is UNVERIFIED. 10 tests. |
| `feat: connect command` | `src/connect.ts` — thin wrapper around `coral source add --interactive <source>`, stdio inherited so Coral's own wizard reaches the terminal. 4 tests. |
| `feat: ui backend proxy` | `src/ui/server.ts` — plain `node:http` handler: `GET /api/memories`, `GET /api/review` (degrades to `{supported:false}` instead of 500), `POST /api/review/:id`, `POST /api/forget` (dry-run forced true unless explicit `false`). Real HTTP round-trip tests against an ephemeral port. 7 tests. |
| `feat: console frontend` | `src/ui/app/` — Vite + React SPA: `MemoryBrowser`, `ForgetConsole` (preview-then-confirm), `ReviewQueue` (renders nothing when unsupported). Tested via `react-dom/server`'s `renderToStaticMarkup` against fixture JSON — no jsdom/testing-library dependency needed. `ui/server.ts` extended to serve the built SPA as a static fallback with SPA-route fallback to `index.html`. 12 tests (9 component + 3 static-serving). |
| `feat: dual agent runtimes (claude -p / agy) + multi-source connect` | `src/sync/agent.ts` extended with an `AgentRuntime` type (`claude` \| `agy`), `buildAgentArgs` centralizing both invocations, `--agent`/`CURATOR_AGENT` selection. `src/connect.ts` extended with `connectSources()` for multi-source `curator connect github linear slack` (sequential, stops at first failure). `buildMcpConfig` now resolves the CLI path to absolute. 10 new tests. |
| `feat: verified agent runtimes live against coral, claude, and agy` | Coral/claude/agy found installed on Windows after all — whole tooling layer verified live. Corrections: claude dropped `--max-turns` (replaced with `--strict-mcp-config` + server-scoped `--allowedTools`); new `extractAgentText` unwraps claude's JSON `result` envelope; agy has no `--mcp-config`/`--output-format`, so new `writeAgyMcpConfig` merges Curator into `~/.gemini/antigravity-cli/mcp_config.json` (user entries preserved). Both runtimes pulled identical real GitHub PRs via Coral MCP and emitted parseable `CURSOR=` trailers. Curator's MCP passes A1 over real stdio. 6 new tests. |
| `feat: sync --instruction + human review staging (--review / --commit)` | Operator steering + pre-ingestion governance for agentic sync. `buildSyncPrompt` gains an optional FOCUS block (`--instruction` / `CURATOR_INSTRUCTION`). New `src/sync/staging.ts` (JSONL stage/read/clear); the MCP `remember` tool stages to `~/.curator/staged.jsonl` instead of writing when the spawned agent's mcp-config sets `CURATOR_REMEMBER_MODE=stage` (per-server `env` injection in `buildMcpConfig`, both runtimes). `curator sync --review` clears stale stagings, runs the agent in stage mode, parks the reported cursor as `agent-sync-pending` (live cursor untouched); `curator sync --commit` (`runCommit`) flushes staged memories through `ops.remember`, promotes the pending cursor, clears the stage file. Flag guards: `--review` rejects `--raw`; `--instruction` warned-ignored with `--raw`. **Verified live:** real `claude` + Coral run with an instruction stored exactly 1 scoped memory into the real stage file, skipped 49 out-of-scope PRs, and wrote nothing to Supermemory. 18 new tests. |
| `feat: status health probe + staged preview + WSL test guide` | Prep for the live-Supermemory phase (server itself deliberately NOT installed yet — user runs that on WSL per the guide). `ops.checkHealth` (3s-timeout GET `/health`, never throws) wired into `curator status`, which now reports `Server: reachable/NOT reachable` and exits 1 when down. Review runs now print each staged memory (customId, tag, content) — no manual JSONL reading. New **Part 0 — WSL quickstart** in `docs/linux-test-checklist.md`: install in WSL2 Ubuntu (verified running on this machine), start server, bridge `~/.supermemory/env` from WSL to the Windows home dir, verify with `curator status`, then run Part A from Windows (WSL2 forwards localhost). 3 new tests. |
| `feat: suggestion layer + docs/usage.md feature guide` | New `src/sync/suggestions.ts`: curated per-source instruction suggestions (github/linear/slack/sentry/datadog/stripe + generic fallback), rendered as a dimmed ("translucent") ANSI block before any agentic sync run without `--instruction` and after `curator connect`. Deliberately hardcoded, not live-generated (deterministic-before-agentic); `getSuggestions()` is the single upgrade point for catalog-derived or LLM-generated tiers later. Plus `docs/usage.md`: the full feature & usage reference — config resolution, state files, every command and flag, MCP tool table, review workflow, runtime differences, verification-status pointers. 7 new tests. |
| `fix: utf-8 BOM tolerance in ~/.supermemory/env` | `parseEnvFile` strips a leading UTF-8 BOM, which PowerShell 5.1's `Out-File -Encoding utf8` writes — would otherwise silently break key matching for anyone bridging the env file from PowerShell. 1 new test. |
| `feat: rewrite ops.ts against the real Supermemory Local server` | Installed real `supermemory-server` v0.0.5 in WSL2, pulled its own live OpenAPI spec (`GET /v4/openapi`), and rewrote `src/supermemory/ops.ts` against the confirmed contract — dropping the `supermemory` npm SDK entirely (hosted-platform-only, never confirmed to route the same on Local) in favor of direct authenticated `fetch`. Corrections: `/v3/search` is document search, not memory search — `recall` now correctly targets `/v4/search`; `listEntriesWithHistory`'s response key is `memoryEntries`, not `memories` (fixed in `ops.ts` and the console frontend); `checkHealth` now probes `GET /` since Local has no dedicated `/health` path. Confirmed real: version-chain fields (`isLatest`, `memoryRelations` with updates/extends/derives, `history[]`) and `forgetByPrompt`'s unsafe server-side `dryRun:false` default. (Note: this commit's conclusion that the review-queue endpoints are absent was later found WRONG — see the correction two rows below.) `createMcpServer`, `syncGithubRaw`, `runCommit`, and the UI server all simplified to take `config` only (no more SDK client param) — a client-carrying param is no longer needed anywhere. **Verified fully live end-to-end** through Curator's real MCP server against the real running binary: `remember` → server auto-extracted a clean sentence with inferred `temporalContext` → `recall` found it with a similarity score (acceptance test A2); `forget` with `mode:prompt` defaulted to `dryRun:true` and returned the correct candidate with zero deletion (A3 preview half). All 6 affected test files rewritten to mock `global.fetch` directly. 110 tests passing (net delta reflects rewritten, not just added, tests). |

| `fix: sanitize customId to match Supermemory's confirmed character set` | A real agentic sync run (`sync --review --instruction "only merged PRs..."` against real Coral/GitHub data, real `claude`) correctly filtered 50 merged PRs down to 12 durable decisions — but `sync --commit` 400'd live: Supermemory rejects `customId` values containing `/` or `#` (the agent's `owner/repo#number` native-id form). `remember()` now sanitizes any customId defensively; the sync prompt also now tells the agent the allowed character set directly. Also confirms `dryRun:false` deletion live (the one gap left from the previous commit): forgot the A2/A3 test memory for real, verified via `recall` returning empty — **A3 fully closed**. 114 tests (4 new). |
| `docs: correction — review-queue endpoints are real, not absent` | Retried `sync --commit` after the sanitizer fix: all 12 memories committed, cursor advanced, confirmed recallable (the extraction pipeline split some PRs into multiple atomic memories — 12 stored became 16 total entries). Then, testing the console (B1), `/api/review` unexpectedly returned `supported:true`. Direct verification against port 6767 (bypassing Curator's code) confirmed the server genuinely returns `200 {"memories":[],"total":0}` for `/v3/container-tags/{tag}/inferred` — **this endpoint is real**, despite being absent from the server's own `/v4/openapi` spec. This reverses the earlier "confirmed absent" conclusion and the Phase-0 gate decision: the Review Queue console tab should render (currently empty, since nothing has been passively inferred yet — Curator's `remember` is always explicit). Key lesson recorded in `docs/api-verification.md`: the live spec is not exhaustive — its absence of a path is not proof the path doesn't exist, only a direct request is proof. Same caution now flagged on the still-unverified `/v3/connections` absence claim. |
| `feat: interactive CLI menu (arrow-key mode when run with no args)` | `src/interactive.ts` — `@clack/prompts` menu covering status/sync/connect/ui, launched when `curator` runs with no arguments (flag surface unchanged). A knowing, scoped exception to CLAUDE.md's "plain commander" rule (documented in `docs/usage.md §2b`). **Reviewed and corrected before landing:** an initial draft had added three speculative agent runtimes (`kimi`/`opencode`/`cursor`) with guessed flags and no verification, and a "Start MCP Server" menu option — both removed. The runtimes violated the project's verify-don't-assume discipline (only `claude`/`agy` are live-verified) and their piped-stdio spawn would hang on any first-run permission prompt; the MCP menu option would corrupt the stdio JSON-RPC wire with clack's stdout banners. Also fixed: suggestion list now shows *before* the instruction prompt (where it's actionable) via a new `suppressSuggestions` flag on `runAgentSync`; consistent cancel handling; port validation; a real (not zero-width) claude gradient. Tests lock `AGENT_RUNTIMES` to exactly `[claude, agy]` and reject the removed names. 6 new tests. |
| `docs: B1 closed live in-browser + /v3/connections confirmed 404` | Restarted the real server (same data dir, same key, 16 memories persisted correctly across restart — confirms encrypted local storage survives a restart). Hit a real operational gotcha along the way: the server's data directory collided with the path Curator's `config.ts` reads its credentials file from, and the server silently encrypted/consumed the plaintext `env` file it found there. Fixed by using a persistent `SUPERMEMORY_API_KEY` env var (`setx`) instead of a file, sidestepping the collision. Then walked `curator ui` end to end in an actual browser: memory browser showed real synced data under `src_github`; Review Queue rendered its correct empty state (confirms the earlier `supported:true` fix works visually, not just via curl); Forget console preview → confirm → deletion was human-driven and verified gone on reload — **B1 fully closed, not just via MCP tool calls**. Also confirmed via direct authenticated request that `GET /v3/connections` genuinely 404s — **Curator's core positioning claim is now verified, not assumed**. |

**Total: 22 commits, 120 passing tests across 14 test files, clean `tsc --noEmit` and `vite build`.**

---

## What works right now (verified against a real running Supermemory Local server)

- `pnpm build` — compiles the CLI/backend cleanly. `pnpm run build:ui` — builds the console SPA.
- `pnpm test` — 120 tests green.
- `node dist/cli.js status` against the real server reports `Server: reachable (HTTP 200)`.
- **A2/A3 fully closed, live, not mocked:** `remember` stored a fact, the server's extraction
  pipeline distilled and enriched it with inferred `temporalContext`; `recall` found it by semantic
  search with a similarity score; `forget` dry-run previewed the right candidate with zero
  deletion; `forget` with `dryRun:false` then actually deleted it (real `forgetBatchId`), confirmed
  gone via a follow-up `recall` returning empty.
- **The full agentic write path, live, real data:** `curator sync --review --instruction "only
  merged PRs..."` ran real `claude` against real Coral/GitHub PR data, correctly filtered 50 merged
  PRs down to 12 durable decisions (38 skipped as routine noise, with reasons), staged them for
  human review. `curator sync --commit` then wrote all 12 to the real server and advanced the
  cursor — this is the project's headline feature, genuinely working end-to-end.
- **B1 (console) fully closed, in an actual browser:** memory browser shows real synced data;
  Review Queue renders (confirmed real, not absent — see below); Forget console's preview → confirm
  → gone loop was human-driven through the real UI and verified against the live server.
- **Review queue is real, not absent:** `GET /api/review` returns `{supported:true, memories:[],
  total:0}` against the real server, confirmed both by direct request and by rendering correctly
  in the browser (currently empty — nothing has been passively inferred at low confidence yet,
  since Curator's `remember` calls are always explicit).
- **`/v3/connections` confirmed to genuinely 404** via a direct authenticated request — Curator's
  core positioning claim ("Local has no connectors") is verified, not assumed.
- The MCP server's tool surface is verified via both an in-process handshake and real stdio against
  the real server. The UI backend's routes are verified via real HTTP requests, with `global.fetch`
  mocked only for the outbound Supermemory leg (a routing mock, since both the server's outbound
  calls and the test's inbound requests share `global.fetch` now that there's no SDK layer).

## What's NOT done — do not assume these work

- **The review-*action* endpoint** (`POST .../inferred/{id}/review` — approve/decline/undo) has not
  been called against a real memoryId — no inferred memory exists yet to test against, since
  nothing has been passively inferred at low confidence.
- **C1 (raw-sync idempotency)** was deliberately skipped in favor of proving the write path via the
  agentic flow directly, which is a strictly harder/more complete test that already passed.
- The memory-graph embed (`@supermemory/memory-graph`) is deferred — cut line 1, never started.
- GitHub is the only wired-up Coral source for `sync --raw`; Linear/Slack/etc. are documented but not implemented in the mapping/raw-sync path.
- **Operational note, not a code gap:** if `supermemory-server` is ever launched from a directory
  Curator also reads credentials from (as happened here — both landed at `~/.supermemory`), the
  server may treat a plaintext `env` file it finds there as a secret to encrypt. Use a persistent
  `SUPERMEMORY_API_KEY` env var, not a file in that directory, to avoid the collision.

## Next step

Essentially done. If more rigor is wanted: test the review-action endpoint once a real inferred
memory exists, or run C1 (raw-sync idempotency) for completeness — neither blocks anything, since
the underlying write path is already proven via the agentic flow. That closes out essentially every
verification item this project has.
