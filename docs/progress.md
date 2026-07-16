# Curator — Progress

Snapshot of what's been built since `git init`, for anyone (including future-us) picking this up
mid-stream. Read `docs/context.md` → `docs/plan.md` → `docs/roadmap.md` →
`docs/implementation-plan.md` for the why/what/when/how; this file is "where are we right now."

**Current status: EVERYTHING is now verified live (2026-07-16).** Coral, claude, and agy were
confirmed on Windows (see `docs/api-verification.md` §11), the instruction/review-staging layer was
proven end-to-end, and — the last open question — a real `supermemory-server` v0.0.5 was installed
in WSL2, its actual live OpenAPI spec was pulled, `src/supermemory/ops.ts` was rewritten against the
confirmed contract (dropping the hosted-platform `supermemory` npm SDK entirely), and the full
`remember`→`recall`→`forget`(dry-run) loop was proven through Curator's real MCP server against the
real running binary. See `docs/api-verification.md` §12 for the full contract and "What's NOT done"
below for the few remaining gaps (mainly: proving an actual deletion, and Coral→agent→Supermemory
end-to-end).

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
| `feat: rewrite ops.ts against the real Supermemory Local server` | Installed real `supermemory-server` v0.0.5 in WSL2, pulled its own live OpenAPI spec (`GET /v4/openapi`), and rewrote `src/supermemory/ops.ts` against the confirmed contract — dropping the `supermemory` npm SDK entirely (hosted-platform-only, never confirmed to route the same on Local) in favor of direct authenticated `fetch`. Corrections: `/v3/search` is document search, not memory search — `recall` now correctly targets `/v4/search`; `listEntriesWithHistory`'s response key is `memoryEntries`, not `memories` (fixed in `ops.ts` and the console frontend); `checkHealth` now probes `GET /` since Local has no dedicated `/health` path. Confirmed real: version-chain fields (`isLatest`, `memoryRelations` with updates/extends/derives, `history[]`), `forgetByPrompt`'s unsafe server-side `dryRun:false` default, and that the review-queue endpoints are genuinely absent from this server build. `createMcpServer`, `syncGithubRaw`, `runCommit`, and the UI server all simplified to take `config` only (no more SDK client param) — a client-carrying param is no longer needed anywhere. **Verified fully live end-to-end** through Curator's real MCP server against the real running binary: `remember` → server auto-extracted a clean sentence with inferred `temporalContext` → `recall` found it with a similarity score (acceptance test A2); `forget` with `mode:prompt` defaulted to `dryRun:true` and returned the correct candidate with zero deletion (A3 preview half). All 6 affected test files rewritten to mock `global.fetch` directly. 110 tests passing (net delta reflects rewritten, not just added, tests). |

**Total: 19 commits, 110 passing tests across 13 test files, clean `tsc --noEmit` and `vite build`.**

---

## What works right now (verified against a real running Supermemory Local server)

- `pnpm build` — compiles the CLI/backend cleanly.
- `pnpm run build:ui` — builds the console SPA into `dist/ui/app`.
- `pnpm test` — 110 tests green.
- `node dist/cli.js --help` / `status` / `mcp` / `sync --raw` / `sync --agent <bad>` / `sync --raw --review` / `connect --help` — all fail or succeed with clean, actionable one-line messages, never a raw stack trace.
- `node dist/cli.js status` against the real server reports `Server: reachable (HTTP 200)`.
- **Live end-to-end proof through Curator's real MCP server**: `remember` stored a fact, the real
  server's extraction pipeline distilled and enriched it (inferred `temporalContext`), `recall`
  found it by semantic search with a similarity score, and `forget` (mode:prompt) correctly
  defaulted to a dry-run preview of the right candidate with zero deletion. This is acceptance
  tests A2 and A3's preview half, genuinely passing — not mocked.
- The full review loop minus the final write: `curator sync --review --instruction "<focus>"` runs a real agent against real Coral data, stages scoped proposals to `~/.curator/staged.jsonl`, and leaves the live cursor untouched.
- The MCP server's tool surface (4 tools, dry-run-by-default forget) is verified via a real in-process MCP handshake AND real stdio against the real server.
- The UI backend's routes are verified via real HTTP requests against an ephemeral port, with `global.fetch` mocked only for the outbound Supermemory leg.
- The console components render correctly against fixture data shaped like the now-confirmed API responses.

## What's NOT done — do not assume these work

- **`dryRun:false` actually deleting a memory** has not been run yet (deliberately, to avoid
  mutating state mid-verification) — the dry-run preview path is proven, the real-delete path
  is architecturally identical but unexercised.
- Acceptance tests C1–S1 (`docs/implementation-plan.md` §7) — Coral writing through an agent into
  this real Supermemory server end-to-end — have not been run. A1–A3(preview) have passed.
- The review-queue console tab: confirmed **absent** from this Local build (not just unconfirmed)
  — `/v3/container-tags/{tag}/inferred` does not exist in the server's live OpenAPI spec. The
  console's `{supported:false}` fallback means this tab simply won't appear; that's correct
  behavior, not a bug to fix.
- The memory-graph embed (`@supermemory/memory-graph`) is deferred — cut line 1, never started.
- GitHub is the only wired-up Coral source for `sync --raw`; Linear/Slack/etc. are documented but not implemented in the mapping/raw-sync path.

## Next step

Run acceptance tests C1 → S1 in order (`docs/implementation-plan.md` §7): `curator sync --raw`
twice for idempotency (C1) against the real server, then a real GitHub issue → sync → recall (C2),
then the console loop (B1) and confirmed deletion via `dryRun:false`. Everything needed —
credentials, a running server, and correct endpoint contracts — is now in place.
