# Linux Test Checklist

Everything in this file was **deferred from the Windows blind-build phase** because Supermemory
Local was unavailable there. (Coral, `claude`, and `agy` have since been verified live on Windows —
`docs/api-verification.md` §11 — so only the Supermemory-facing steps remain.) Run these in order.
Each step's pass condition is stated explicitly — do not mark anything done without observing that
condition. If a step fails or behaves differently than expected, update
`docs/api-verification.md` (flip STATUS, record the real finding) before moving on — do not
silently patch around it.

Companion reference for endpoint guesses: `docs/api-verification.md`. Full context: `docs/plan.md`,
`docs/roadmap.md`, `docs/implementation-plan.md` §1 and §7.

---

## Part 0 — WSL quickstart (running Supermemory Local from the Windows dev machine)

The dev machine already has **WSL2 Ubuntu running** (verified 2026-07-12; Docker Desktop is also
present as a fallback). WSL2 forwards `localhost`, so a server listening inside Ubuntu is reachable
from Windows at `http://localhost:6767` — Curator stays on Windows and talks to the WSL server
directly. This substitutes for the separate Linux device everywhere this checklist says "Linux".

1. **Install inside Ubuntu.** The installer wants an LLM key for the extraction pipeline (any one
   of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`); export it first so the prompt is
   skipped. In a WSL shell:
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY / GEMINI_API_KEY
   curl -fsSL https://supermemory.ai/install | bash
   ```
   The installer downloads the matching binary from `supermemoryai/supermemory` GitHub releases,
   writes `~/.supermemory/env` (inside WSL), and drops a wrapper at
   `~/.local/bin/supermemory-server`. `SUPERMEMORY_NO_START=1` installs without starting.

2. **Start the server** (WSL shell) and leave it running:
   ```bash
   supermemory-server
   ```

3. **Bridge the credentials to Windows.** The installer wrote `~/.supermemory/env` in the WSL
   filesystem, but Curator on Windows resolves `~/.supermemory/env` in the *Windows* home dir.
   Copy it across (Git Bash on Windows):
   ```bash
   mkdir -p ~/.supermemory
   wsl -e bash -lc 'cat ~/.supermemory/env' > ~/.supermemory/env
   ```
   ⚠️ While doing this, record the **exact variable names** in the real file into
   `docs/api-verification.md` "Credentials note" (`SUPERMEMORY_API_KEY` is still a guess). If the
   names differ, correct `src/config.ts`.

4. **Verify from the Windows side:**
   ```bash
   node dist/cli.js status
   ```
   Pass: prints the base URL, a redacted key, and `Server: reachable (...)`. This exercises both
   config resolution and the health probe in one shot. Then continue with Part A below — run it
   from Windows Git Bash; `localhost:6767` transparently reaches the WSL server.

---

## Part A — Phase 0 environment & API probes (skipped on Windows, run first)

1. **Supermemory Local up**
   ```bash
   curl -s http://localhost:6767/health
   ```
   Pass: server responds (not connection-refused). If it fails: `START supermemory-server FIRST`.

2. **Credentials present**
   ```bash
   cat ~/.supermemory/env
   ```
   Pass: file exists with a key variable (record its **exact name** in
   `docs/api-verification.md` §"Credentials note" — do not paste the value anywhere).

3. **Store one memory**
   ```bash
   curl -s http://localhost:6767/v3/documents -H "Authorization: Bearer $SM_KEY" \
     -H "Content-Type: application/json" \
     -d '{"content":"Curator bootstrap test memory","containerTag":"curator_test"}'
   ```
   Pass: `{id, status}` response. Record actual response shape.

4. **Search for it**
   ```bash
   curl -s http://localhost:6767/v4/search -H "Authorization: Bearer $SM_KEY" \
     -H "Content-Type: application/json" \
     -d '{"containerTag":"curator_test", ...}'
   ```
   **First confirm the query-text field name** (try `q` and `query` if the first attempt 400s —
   see `api-verification.md` §2 open question) before treating this as pass/fail.
   Pass: the bootstrap memory appears in results. Record the full response shape.

5. **Gap + capability probes** — for each, record status code + body in `docs/api-verification.md`:
   - a. `GET /v3/connections` (or documented method) → **expect unimplemented** (404/501/etc.) —
     this documents Curator's reason to exist precisely.
   - b. `POST /v4/memories/list` with a `containerTags` array → confirm history/version-chain
      fields (`updates`/`extends`/`derives`, `isLatest`) are present, or note their absence.
   - c. `GET /v3/container-tags/{tag}/inferred` → confirm the review-queue list works.
   - d. `POST /v3/container-tags/{tag}/inferred/{id}/review` with `{"action":"decline"}` on a test
      item → confirm approve/decline/undo behavior.
   - e. `POST /v4/memories/forget-matching` with `dryRun:true` → confirm preview shape matches
      `api-verification.md` §6 and that `dryRun:true` truly does not delete (re-run the search from
      step 4 and confirm the memory still exists).
   - f. `POST /v4/profile` → confirm request/response shape.

   **Gate decision (per `docs/roadmap.md` Phase 0):**
   - If probe (c)/(d) fail → build/keep the console **without** the Review Queue tab; note the
     limitation in README.
   - If probe (b) fails → memory browser lists latest entries only, no version chains.
   - Everything else is required for the MVP demo path.

6. **Coral** — ✅ **already VERIFIED on Windows 2026-07-12** (see `docs/api-verification.md` §11):
   `coral sql --format json`, `coral source add --interactive`, credential refresh via
   `GITHUB_TOKEN=$(gh auth token) coral source add github`, `coral mcp-stdio` (5 MCP tools), and
   the exact raw-sync query shape all work against live GitHub data. On Linux only re-run the
   install + `coral source test github` to confirm the same setup exists there:
   ```bash
   brew install withcoral/tap/coral || curl -fsSL https://withcoral.com/install.sh | sh
   GITHUB_TOKEN=$(gh auth token) coral source add github
   coral source test github
   ```

7. **Headless agent runtimes** — ✅ **flags already VERIFIED on Windows 2026-07-12** against
   claude 2.1.207 and agy 1.1.1, including live Coral-MCP reads from both
   (`docs/api-verification.md` §11). Notable: claude dropped `--max-turns`; agy has no
   `--mcp-config`/`--output-format` and reads `~/.gemini/antigravity-cli/mcp_config.json`.
   On Linux just smoke the installed versions (flags can drift between releases):
   ```bash
   claude -p "reply with the word ok" --output-format json
   agy -p "reply with the word ok"
   ```
   If either fails, `buildAgentArgs` in `src/sync/agent.ts` is the single place to correct.

---

## Part B — Acceptance tests (run in order; each must pass before the next)

Verbatim from `docs/implementation-plan.md` §7.

1. **A1:** `node dist/cli.js mcp` handshakes with MCP Inspector
   (`npx @modelcontextprotocol/inspector`) and lists exactly 4 tools:
   `remember`, `recall`, `forget`, `get_profile`.

2. **A2:** In Claude Desktop with curator configured: say "remember my hackathon deadline is
   July 13" → start a **new session** → ask "when is my deadline?" → correct recall.

3. **A3:** `forget` with default `dryRun` returns a preview and deletes nothing (verify via
   `recall` afterward); calling again with `dryRun:false` deletes it (recall no longer returns it).

4. **C1:** `curator sync --raw` run twice in a row → the second run stores 0 new documents
   (idempotency via `customId`).

5. **C2:** Create a real GitHub issue → `sync --raw` → ask Claude Desktop about it → correct recall.

6. **B1:** Console lists the synced memories; forget flow (preview → confirm) removes one; Claude
   no longer recalls it via MCP.

7. **B2 (conditional on Part A step 5c/5d passing):** decline an item in the review queue → it
   never surfaces in `recall`.

8. **C3 (agentic):** `curator sync` (no `--raw`) end-to-end stores curated memories with correct
   `customId`s and advances the cursor. If flaky after ~2 hours of tuning, invoke cut line 2
   (`docs/roadmap.md`) and rely on `--raw` for the demo — do not keep debugging past that budget.

9. **S1:** Fresh-machine README walkthrough (or a clean clone) reaches A2 in under 10 minutes.

---

## After this checklist

Any correction discovered while running Part A must be reflected in
`docs/api-verification.md` (flip STATUS) and, if it changes a path/payload/response-shape
assumption, in `src/supermemory/ops.ts` only — per the isolation policy in that file.
