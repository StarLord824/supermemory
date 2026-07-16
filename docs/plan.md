# Curator — a self-feeding, human-governed memory layer for local agents

**Hackathon:** Supermemory Local "localhost:6767" · July 9–13, 2025 · Solo entry
**Submission deadline:** Sunday, July 13 · 23:59 PST (Google Form + Discord #showcase post)
**Working name:** Curator (alternatives: Memento Local, Mission Control, Hippocampus)

---

## 1. One-line pitch

Curator gives Supermemory Local everything that only exists on the hosted platform — an MCP interface for agents, a governance console for humans, and agent-driven connectors powered by Coral — turning the local memory engine into a complete, self-feeding, auditable memory stack that never leaves your machine.

## 2. The problem and the verified gaps

Supermemory Local ships the full memory engine (ingestion, extraction, hybrid semantic search, the complete Memory API) as a single binary on `localhost:6767`. But the product surface around the engine is hosted-only. Verified against the official docs and source code:

- **MCP is platform-only.** The official comparison table in the self-hosting docs marks MCP with a dash for self-hosted. The official MCP server (`supermemoryai/supermemory`, `apps/mcp`) is built on Cloudflare Workers with Durable Objects, authenticates via OAuth against `app.supermemory.ai`, and even in local development requires the main hosted Supermemory API for token validation. It cannot serve the `supermemory-server` binary.
- **Connectors are platform-only** (verified against the Local-vs-Platform table: marked "—" for self-hosted, alongside MCP). On the hosted platform, connectors are a flagship, monetized feature with a dedicated marketing page: OAuth per source (`POST /v3/connections/{provider}` → authLink → user authorizes), initial full import, then continuous sync via real-time webhooks plus a scheduled sync every ~4 hours, all scoped by container tags. This architecture inherently requires their cloud (provider OAuth apps, publicly reachable webhook receivers) — a localhost binary cannot replicate it, which is why Local has no ingestion story beyond manual API calls and the coding-agent plugins. **Day-1 verification:** call `/v3/connections` on `localhost:6767` and confirm it is unimplemented, so the gap can be stated precisely in the README.
- **No human oversight surface exists anywhere.** The API exposes memory version history, a review queue for low-confidence inferred memories (approve/decline), and agentic mass-forget with dry-run preview — but no product, hosted or local, gives a human a console to operate these. As agents begin writing memories autonomously, this is exactly the surface enterprises will demand.

The consequence: an agent running against Supermemory Local can store and search memories through raw SDK calls, but there is no standard agent interface (MCP), no automatic data inflow, and no way for a human to audit or govern what the agent has memorized.

## 3. The solution — three components, one argument

Curator is one CLI/daemon with three faces. The argument that unifies them: **agents ingest autonomously, humans supervise.**

### Component A — MCP server for Supermemory Local (the backbone)

A purpose-built stdio MCP server that targets `localhost:6767` directly. Differentiators over the official hosted server and the minimal community rewrite (see §7):

- **Zero-config on localhost:** no API key needs to be found or pasted at all — Supermemory Local auto-authorizes unauthenticated requests from localhost (verified live, see `docs/api-verification.md` §13), so Curator simply omits the Authorization header when targeting `localhost`/`127.0.0.1`. (Earlier drafts of this plan assumed the key could be auto-discovered from `~/.supermemory/env`; live testing found that file holds the LLM provider key, not a Supermemory key, and the real Supermemory key is generated at server boot with no file to read it from — the localhost-skip approach is what actually delivers on "no secrets to paste.") For a non-localhost `baseUrl`, set `SUPERMEMORY_API_KEY` explicitly.
- **Tools:** `remember` (store, with optional `containerTag` and `customId`), `recall` (hybrid search, optional profile inclusion), `forget` (single memory or agentic prompt-based mass-forget, always with `dryRun` preview support), `get_profile` (user/context profile).
- **Project scoping** via container tags so one local server cleanly serves work, personal, and per-repo memory spaces.
- Works in Claude Desktop, Cursor, and Windsurf — clients that have no official Supermemory plugin (the plugins cover only Claude Code, Codex, and OpenCode).

Tool schema sketch:

```json
{
  "remember": {
    "content": "string (required)",
    "containerTag": "string (optional, default 'curator_default')",
    "customId": "string (optional, enables dedup/update)",
    "metadata": "object (optional, e.g. {source: 'github', syncedAt: ...})"
  },
  "recall": {
    "query": "string (required)",
    "containerTag": "string (optional)",
    "includeProfile": "boolean (default true)",
    "limit": "number (default 10)"
  },
  "forget": {
    "target": "string (memory id OR natural-language prompt)",
    "mode": "'id' | 'prompt'",
    "dryRun": "boolean (default true — must be explicitly false to delete)"
  },
  "get_profile": {
    "containerTag": "string (optional)"
  }
}
```

### Component B — Governance console (the human face)

A single-page local web UI (served by `curator ui`) with three panels, each backed by an existing Supermemory Local API — the console is pure UI over shipped server logic:

1. **Memory browser with history** — list memories per container tag with version chains (`updates` / `extends` / `derives` relations, `isLatest` flags) via the "list memory entries with history" endpoint. Optionally embeds the official `@supermemory/memory-graph` React component for the interactive graph view (canvas-rendered, handles hundreds of nodes).
2. **Review queue** — surfaces low-confidence inferred memories via the "review inferred memories" endpoint with one-click approve / decline / undo. This is the human-in-the-loop checkpoint for agent-written memories.
3. **Forget console** — natural-language forget ("everything about client X") using the agentic mass-forget endpoint, always showing the `dryRun` preview list before a confirmed deletion. Doubles as the GDPR / right-to-be-forgotten story.

### Component C — Agentic sources via Coral (the inflow)

**Positioning note — call these "agentic sources," not "connectors."** Hosted connectors are a paid-platform differentiator, so a "connectors for Local" pitch reads as rebuilding the sponsor's premium feature for free. Curator's design is genuinely different and should be framed that way: (a) the source set is developer/enterprise tools (Linear, Slack, Sentry, Datadog, Stripe; only GitHub overlaps with their office/consumer set of Drive, Gmail, Notion, OneDrive), and (b) the mechanism is agent-driven pull with human governance, not webhook push. This is a complementary, local-first ingestion paradigm that extends Local in a direction the platform doesn't cover.

Instead of hand-building per-app integrations (OAuth, webhooks, pagination), Curator delegates data fetching to **Coral** (`withcoral/coral`, Apache-2.0, Rust): a local-first SQL runtime that exposes APIs as SQL tables (`github.issues`, `linear.attachments`, `slack.*`, plus Sentry, Datadog, Stripe, and local JSONL/Parquet files), handling auth, pagination, retries, and cross-source JOINs. Credentials are stored locally and never leave the machine — matching the hackathon's local-first ethos.

The flow:

1. `curator connect` shells out to `coral source add --interactive <source>` — Coral's own wizard collects credentials; Curator never touches secret storage.
2. `curator sync` spawns a headless agent (`claude -p` with `--mcp-config`) armed with **two MCP servers: Coral's (read) and Curator's own Component A (write)**. The prompt template instructs it to: check the sync cursor, query what changed in connected sources since then via Coral SQL, decide what is worth remembering, store each item through the `remember` tool using a deterministic `customId` convention (`{source}:{type}:{native_id}`) for dedup, advance the cursor, and report what it stored.
3. Supermemory Local's extraction pipeline distills the ingested rows into memories; new low-confidence inferences land in the Component B review queue for human approval.

**Deterministic fallback (build this first):** `curator sync --raw` runs a fixed Coral SQL query and ingests rows directly with no agent in the loop (~50 lines). This is the demo safety net and proves the pipeline independent of agent behavior.

The self-consumption is deliberate: the project's own MCP server is the ingestion interface for its own connector agent. Components are not a feature list; they consume each other.

## 4. Architecture and data flow

```
                      ┌─────────────────────────────────────────┐
                      │                Curator CLI               │
                      │  connect │ sync [--raw] │ ui │ mcp       │
                      └────┬──────────┬──────────┬────────┬─────┘
                           │          │          │        │
              coral source add   headless agent  │   stdio MCP server ──► Claude Desktop /
                           │     (claude -p)     │        │               Cursor / Windsurf /
                           ▼          │          │        │               any MCP client
                      ┌─────────┐     │ reads via│        │
   GitHub PAT ──────► │  Coral  │◄────┤ Coral MCP│        │ remember / recall /
   Linear key ──────► │ (SQL over│    │          │        │ forget(dryRun) / get_profile
   Slack token ─────► │  APIs)  │     │ writes via Curator MCP
                      └─────────┘     ▼          │        ▼
                                 ┌────────────────────────────────┐
                                 │   Supermemory Local :6767       │
                                 │   engine · embeddings · API     │
                                 │   (extraction via user's LLM:   │
                                 │    cloud key or Ollama)         │
                                 └───────────────┬────────────────┘
                                                 │ history · review queue ·
                                                 │ mass-forget(dryRun) · graph
                                                 ▼
                                 ┌────────────────────────────────┐
                                 │   Governance console (web UI)   │
                                 │   browse │ review │ forget      │
                                 └────────────────────────────────┘
```

Live data (Coral) → agent curation (headless Claude via two MCPs) → persistent memory (Supermemory Local) → agent access (Curator MCP) + human oversight (console). Every arrow is thin glue code; all heavy machinery is borrowed from open source.

## 5. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (Node 20+ or Bun) | MCP TypeScript SDK maturity; Supermemory JS SDK; one language across CLI, MCP, and UI backend |
| MCP | `@modelcontextprotocol/sdk`, stdio transport | Standard; works in Claude Desktop/Cursor/Windsurf with a command-based config |
| Memory engine | Supermemory Local binary (`supermemory-server`) | The hackathon requirement and the core of the stack |
| Supermemory client | `supermemory` npm SDK, `baseURL: http://localhost:6767` | Official SDK; one-line retarget from hosted |
| Extraction LLM | Anthropic/OpenAI key, or Ollama for fully-offline mode | Supermemory Local requires a model; Ollama variant strengthens the privacy pitch |
| Connectors | Coral binary (`brew install withcoral/tap/coral`) | Bundled sources, local credential storage, SQL interface, built-in MCP server |
| Sync agent | `claude -p` (headless Claude Code) with `--mcp-config` | Autonomous curation loop; swap-able for any MCP-capable agent CLI |
| Console UI | Single-page app (Vite + React) served by the CLI; embeds `@supermemory/memory-graph` | Fast to build; official graph component for free visual impact |
| State | A small JSON file for sync cursors and settings (`~/.curator/state.json`) | No database needed; Supermemory holds all real data |

## 6. Supermemory Local APIs used (meaningful-use evidence)

- `POST /v3/documents` — ingestion of synced rows and manual memories (with `customId` for dedup and update-in-place)
- `POST /v3/search` and `/v4/search` — recall tool, console search
- `/v4/profile` — profile tool and context injection
- List memory entries with history — version-chain browser
- Review inferred memories (list / approve / decline / undo) — review queue panel
- Forget a memory + agentic mass-forget with `dryRun` — forget tool and console
- Container tags — project scoping across MCP, sync, and console

This exercises breadth of the Local API well beyond add/search, which directly supports the "meaningfully uses Supermemory Local" rule.

## 7. Pre-existence analysis and differentiation

| Existing artifact | What it is | Why Curator is different |
|---|---|---|
| Official Supermemory MCP (`apps/mcp`) | Cloudflare Workers + Durable Objects, OAuth against hosted platform; local dev requires the hosted API for token validation | Curator's MCP is stdio, offline, targets the local binary, zero-config via `~/.supermemory/env`, and adds dry-run forget |
| `Fuwn/supermemory-mcp-local` | Minimal local-process rewrite of the hosted MCP (1 commit, 2 stars); mirrors hosted tools (`whoAmI`, `listProjects`) and authenticates in hosted style | Not purpose-built for the Local binary; no governance surface, no connectors, no dry-run semantics |
| Official coding plugins (Claude Code, Codex, OpenCode) | Work against Local via `SUPERMEMORY_API_URL` | Cover only those three tools; Curator serves Claude Desktop, Cursor, Windsurf, and any MCP client, plus the whole governance/ingestion layer |
| `@supermemory/memory-graph` | Official React visualization component | Used as a dependency, credited; Curator's console value is the review queue + forget flows, which no product ships |
| SMFS | Supermemory's new grep-able memory filesystem | Different paradigm (filesystem for agents); Curator deliberately does not compete with it |
| Platform connectors | Drive/Gmail/Notion/etc., hosted-only | Curator's Coral-backed sources (GitHub, Linear, Slack, Sentry, Datadog, Stripe, files) are a different, developer/enterprise-oriented set — extending Local in a new direction rather than cloning the hosted feature |

## 8. Relevance and audience

- **Developers:** persistent, private memory for every MCP-capable coding tool; project-scoped via container tags.
- **Startups:** a full local memory stack with zero cloud dependency and zero cost; prototype locally, move to the hosted platform later with one baseURL change.
- **Enterprises:** the air-gapped/compliance story — agent memory that is auditable (review queue), reversible (versioned history), and erasable on demand (dry-run mass-forget; GDPR right-to-be-forgotten). Agent-written memories are precisely the artifact compliance teams will need to govern.
- **Sponsor fit:** fills the "—" cells of Supermemory's own Local-vs-Platform comparison table (MCP and ingestion, both verified) using their own APIs and their own graph component — a flattering, judge-legible contribution. Connectors are a flagship, monetized platform feature with a dedicated marketing page, so the demand for this capability is proven by the sponsor's own product strategy; Curator addresses it for Local via the complementary "agentic sources" paradigm rather than cloning the hosted feature (see Component C positioning note).

## 9. Build plan (3 days, with cut lines)

**Day 1 — backbone.** Install and verify Supermemory Local (store + search one memory). **API surface verification (15 min, do first):** against `localhost:6767`, confirm (a) `/v3/connections` is unimplemented — documents the gap precisely; (b) memory history, review-queue, and agentic mass-forget endpoints behave as documented on the local binary (docs are written for hosted; the console depends on these). Scaffold repo, first commit. Build Component A MCP server (4 tools, env auto-discovery). Test in Claude Desktop and Cursor. Install Coral, add the GitHub source, run one successful SQL query. Build `sync --raw` (fixed query → ingest with customId). *End-of-day state: agent-accessible memory + deterministic ingestion working.*

**Day 2 — governance + agent loop.** Build the console: memory browser with history, review queue, forget-with-preview. Embed memory-graph if time allows. Write the agent prompt template and wire `curator sync` to spawn `claude -p` with both MCP configs. Test the full loop end to end.

**Day 3 — polish + ship.** Morning: bug fixes, README (architecture diagram, what-I-built vs what-I-used, Coral + Supermemory credits), `npx`-style install instructions. Afternoon: record the 3-minute demo (budget 3× the expected time), fill the Google Form, post in #showcase with the pinned template.

**Cut lines, in order:** (1) memory-graph embed, (2) agentic sync — keep `--raw` and pitch the agent loop as the roadmap, (3) second Coral source. **Never cut:** the MCP server, the review queue, dry-run forget.

## 10. Demo video script (≤3 min)

1. *(0:00–0:20)* Problem: agents forget; Supermemory Local fixes the engine, but Local has no MCP, no connectors, no oversight. One line: "I built the missing local stack."
2. *(0:20–0:50)* `curator connect` → Coral wizard adds GitHub. `curator sync` → agent queries new issues via Coral, stores memories via Curator's own MCP server. Terminal output shows what it chose to remember.
3. *(0:50–1:30)* Claude Desktop: ask "what's happening in my repo?" — `recall` returns the synced context. Then tell it a personal fact; `remember` fires.
4. *(1:30–2:20)* Console: the new memories appear; the graph view; a wrong inferred memory sits in the review queue → decline it. Type "forget everything about issue #42" → dry-run preview → confirm → ask Claude again → it no longer knows.
5. *(2:20–3:00)* Architecture slide (the diagram above), the ingest→recall→govern loop restated, credits to Supermemory Local and Coral, repo link.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Coral install/source flakes on camera | Set up night 1; JSONL file source as in-Coral fallback; `--raw` mode as pipeline fallback |
| Agent sync is nondeterministic (wrong SQL, duplicates, slow) | Tight prompt template (explicit cursor + customId convention); `--raw` escape hatch; rehearse the exact demo prompts |
| Supermemory Local extraction latency (LLM-dependent) | Use a fast cloud model for the recording; mention Ollama mode verbally |
| Review-queue APIs behave differently on Local than documented | Verify on day 1 against the local binary; if absent locally, degrade panel to history-browser + forget only and note it |
| Scope creep | Cut lines pre-committed in §9; day 3 afternoon is frozen for shipping |
| Someone else ships a Supermemory-Local MCP during the window | Differentiation is the integrated stack (governance + connectors), not the wrapper alone |

## 12. Rules compliance checklist

- Solo team ✅ · Meaningful use of Supermemory Local ✅ (§6) · Fresh code in build window with continuous commit history ✅ (commit from day 1)
- Existing open source used as dependencies, not rebadged: Coral (Apache-2.0), Supermemory SDKs and memory-graph — all credited in README and video ✅
- Public GitHub repo ✅ · Demo video ≤3 min ✅ · Google Form + #showcase post with pinned template before July 13, 23:59 PST ✅

## 13. Credits and licensing

- **Supermemory Local** — memory engine, SDKs, `@supermemory/memory-graph` (open source; hackathon sponsor)
- **Coral** (`withcoral/coral`, Apache-2.0) — local-first SQL runtime powering source connections
- **Curator** — original work: MCP server, governance console, agent orchestration, CLI. License: MIT (attribution-friendly, matches ecosystem norms)

## 14. Source references

- Self-hosting overview & Local-vs-Platform table: supermemory.ai/docs/self-hosting/overview
- Self-hosting quickstart: supermemory.ai/docs/self-hosting/quickstart
- Official MCP server docs & source: supermemory.ai/docs/supermemory-mcp/mcp · github.com/supermemoryai/supermemory (apps/mcp)
- API index (history, review, mass-forget, profiles, container tags): supermemory.ai/docs/llms.txt
- Memory Graph component: supermemory.ai/docs/integrations/memory-graph
- Community MCP rewrite: github.com/Fuwn/supermemory-mcp-local
- Coral: github.com/withcoral/coral · withcoral.com/docs
- Hackathon rules & submission: the "localhost:6767" brief (Google Form + Discord #showcase, due July 13 23:59 PST)
