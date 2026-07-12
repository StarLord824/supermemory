# Curator — Build Roadmap

**Project:** Curator — a self-feeding, human-governed memory layer for local agents, built on Supermemory Local.
**Context:** Supermemory Local hackathon, solo build. Hard deadline: **July 13, 23:59 PST** (Google Form + Discord #showcase post, both mandatory).
**Companion docs:** `PROJECT.md` (full spec, gap analysis, positioning) · `IMPLEMENTATION.md` (agent-executable build instructions).

---

## Guiding constraints

1. Ship a working, polished, narrow product over an ambitious broken one.
2. Every phase ends in a demoable state. Never leave the repo un-demoable overnight.
3. Commit early and continuously — the hackathon verifies fresh work via commit history.
4. Deterministic paths before agentic paths: `sync --raw` before agent sync; direct API calls before UI.
5. The MCP server is the backbone and is never cut. Cut order when behind: (1) memory-graph embed, (2) agentic sync (keep `--raw`, pitch agent loop as roadmap), (3) second Coral source.

---

## Phase 0 — Environment & API verification (½ day gate, do first)

**Goal:** prove every external assumption before writing product code.

Deliverables:
- Supermemory Local installed and running (`supermemory-server` on `localhost:6767`), extraction LLM configured, one memory stored and searched successfully via curl.
- **API surface verification report** (`docs/api-verification.md` in repo) recording, against the *local* binary: (a) `/v3/connections` unimplemented (documents the gap Curator fills); (b) whether memory history, review-queue (inferred-memory approve/decline), and agentic mass-forget (`dryRun`) endpoints work locally as documented for hosted. Fetch the OpenAPI spec and record exact paths/payloads.
- Coral installed; GitHub source added; one successful `coral sql` query returning issue rows.
- `claude -p` runs headless with a trivial `--mcp-config`.
- Repo scaffolded, first commit pushed, MIT license, `.gitignore`.

**Gate decision:** if review-queue endpoints are hosted-only, downgrade Console scope now (history browser + forget console only) and update `PROJECT.md` §11 accordingly. Do not discover this on Day 2.

**Exit criteria:** all four systems (Supermemory Local, Coral, headless Claude, repo) verified working end-to-end independently.

## Phase 1 — MCP server (Component A) — Day 1

**Goal:** any MCP client gets persistent local memory.

Deliverables:
- `curator mcp` — stdio MCP server exposing `remember`, `recall`, `forget` (dry-run default), `get_profile`.
- Zero-config credential auto-discovery from `~/.supermemory/env` with env-var override.
- Container-tag scoping on every tool.
- Verified working in Claude Desktop AND Cursor (screenshot both for README/demo).

**Exit criteria:** in a fresh Claude Desktop session, tell Claude a fact → restart session → Claude recalls it via `recall`. `forget` with `dryRun:true` previews without deleting; with `dryRun:false` deletes; recall confirms.

## Phase 2 — Deterministic ingestion (`sync --raw`) — Day 1, evening

**Goal:** live external data flows into memory without any agent.

Deliverables:
- `curator sync --raw`: runs a configured Coral SQL query (default: GitHub issues/PRs updated since cursor), maps rows → Supermemory documents with `customId = {source}:{type}:{native_id}`, ingests, advances cursor in `~/.curator/state.json`.
- Idempotency proven: running twice creates no duplicates (customId update-in-place).

**Exit criteria:** create a GitHub issue → `curator sync --raw` → ask Claude Desktop about it → correct recall.

## Phase 3 — Governance console (Component B) — Day 2

**Goal:** humans can see and govern what agents remember.

Deliverables (in priority order):
1. `curator ui` serves a local single-page app.
2. **Memory browser** — list memories per container tag; show version history/relations where the local API supports it.
3. **Forget console** — natural-language target → dry-run preview list → explicit confirm → deletion; action log panel.
4. **Review queue** — approve/decline low-confidence inferred memories (only if Phase 0 verified the endpoints locally; else omit and note in README).
5. *(Stretch)* embed `@supermemory/memory-graph` for the graph view.

**Exit criteria:** the full govern loop works on camera: see memory → preview forget → confirm → memory gone → recall via MCP no longer returns it.

## Phase 4 — Agentic sync (Component C) — Day 2, evening → Day 3 morning

**Goal:** an agent, not a script, decides what to remember.

Deliverables:
- `curator connect <source>` — wraps `coral source add --interactive`.
- `curator sync` — spawns `claude -p` with an `--mcp-config` exposing BOTH Coral MCP (read) and Curator MCP (write), using the prompt template in `IMPLEMENTATION.md` (explicit cursor protocol, customId convention, report format).
- Agent-stored memories appear in the console; review queue captures low-confidence inferences (if available).

**Exit criteria:** one rehearsed end-to-end run: new GitHub issue → `curator sync` → agent stores curated memories → visible in console → recallable in Claude Desktop. If flaky after 2 hours of tuning, invoke cut line 2 and rely on `--raw` for the demo.

## Phase 5 — Ship — Day 3

**Goal:** submission-complete by afternoon, not midnight.

Deliverables:
- README: one-line pitch, architecture diagram, quickstart (install → connect → sync → MCP config → ui), what-I-built vs what-I-used, credits (Supermemory Local, Coral, memory-graph), demo video link.
- 3-minute demo video following the script in `PROJECT.md` §10 (budget 3× recording time; record the `--raw` fallback take first, agent take second).
- Google Form submitted; #showcase post using pinned template (name, one-liner, team, repo, video, "how it uses Supermemory Local" in 3–5 sentences).
- Final commit; tag `v0.1.0`.

**Exit criteria:** both submission channels confirmed before 18:00 local time on July 13.

---

## Milestone summary

| Phase | Window | Demoable state at exit |
|---|---|---|
| 0 Verification | Day 1 AM | All systems green; gaps documented |
| 1 MCP server | Day 1 PM | Claude Desktop remembers across sessions |
| 2 Raw sync | Day 1 eve | GitHub data recallable by agents |
| 3 Console | Day 2 | Human governs agent memory on screen |
| 4 Agent sync | Day 2 eve–Day 3 AM | Agent curates memory autonomously |
| 5 Ship | Day 3 | Submitted |

## Risk register (abridged — full table in PROJECT.md §11)

- Coral or source flakes → JSONL file source inside Coral; `--raw` pipeline fallback.
- Agent sync nondeterminism → tight prompt protocol; `--raw` escape hatch; rehearsed demo prompts.
- Local binary lacks review/history endpoints → Phase 0 gate catches it; console degrades gracefully.
- Time → pre-committed cut lines; Day 3 PM frozen for shipping.