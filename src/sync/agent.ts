import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { resolveConfig, type CuratorConfig } from "../config.js";
import { remember } from "../supermemory/ops.js";
import { deleteCursor, getCursor, setCursor } from "../state.js";
import { buildSyncPrompt, parseCursorFromOutput } from "./prompt.js";
import { clearStaged, defaultStageFile, readStaged } from "./staging.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const EPOCH = new Date(0).toISOString();

/**
 * Headless agent runtimes Curator can drive. Both are handed the same
 * two-MCP config (Coral read + Curator write) and the same sync prompt;
 * the runtime is interchangeable per docs/plan.md §5 ("swap-able for any
 * MCP-capable agent CLI").
 */
export type AgentRuntime = "claude" | "agy";

export const AGENT_RUNTIMES: readonly AgentRuntime[] = ["claude", "agy"];

export function resolveAgentRuntime(value: string | undefined): AgentRuntime {
  const runtime = (value ?? "claude").trim().toLowerCase();
  if (!AGENT_RUNTIMES.includes(runtime as AgentRuntime)) {
    throw new Error(
      `Unknown agent runtime "${value}". Supported: ${AGENT_RUNTIMES.join(", ")} ` +
        `(set via --agent or CURATOR_AGENT).`,
    );
  }
  return runtime as AgentRuntime;
}

/**
 * Builds the headless invocation for each runtime. Flags VERIFIED on Windows
 * 2026-07-12 against claude 2.1.207 and agy 1.1.1 (docs/api-verification.md §11):
 *
 * - claude: `-p --mcp-config --strict-mcp-config --output-format json` are
 *   real; `--max-turns` no longer exists and was dropped. --strict-mcp-config
 *   keeps the run scoped to exactly our two servers; --allowedTools grants the
 *   coral/curator MCP tools so headless runs don't stall on permission prompts.
 *   JSON output is an envelope whose `result` field holds the agent's text —
 *   see extractAgentText.
 * - agy (Antigravity CLI): has NO --mcp-config or --output-format. It takes
 *   `-p <prompt>` (plain-text output) and reads MCP servers from its "Global
 *   Configuration" file, ~/.gemini/config/mcp_config.json — see
 *   writeAgyMcpConfig. CORRECTED 2026-07-18: an earlier verification pass
 *   (docs/api-verification.md §11) wrote to ~/.gemini/antigravity-cli/mcp_config.json
 *   instead, which silently loads zero MCP servers on the currently-installed
 *   agy 1.1.3 (confirmed via the binary's own embedded docs and a live
 *   process-spawn test — see docs/api-verification.md §17).
 *   --dangerously-skip-permissions is its only headless tool-approval switch.
 */
export function buildAgentArgs(
  runtime: AgentRuntime,
  prompt: string,
  mcpConfigPath: string,
): { command: string; args: string[] } {
  switch (runtime) {
    case "claude":
      return {
        command: "claude",
        args: [
          "-p",
          prompt,
          "--mcp-config",
          mcpConfigPath,
          "--strict-mcp-config",
          "--allowedTools",
          "mcp__coral",
          "mcp__curator",
          "--output-format",
          "json",
        ],
      };
    case "agy":
      return {
        command: "agy",
        args: ["-p", prompt, "--dangerously-skip-permissions"],
      };
  }
}

/**
 * Pulls the agent's text out of runtime-specific stdout. claude's
 * `--output-format json` wraps the response in a `{"result": "..."}`
 * envelope; agy prints plain text. Falls back to the raw stdout whenever the
 * envelope isn't parseable so cursor parsing still gets a chance.
 */
export function extractAgentText(runtime: AgentRuntime, stdout: string): string {
  if (runtime === "claude") {
    try {
      const parsed = JSON.parse(stdout) as { result?: unknown };
      if (typeof parsed.result === "string") return parsed.result;
    } catch {
      // not a JSON envelope — treat as plain text
    }
  }
  return stdout;
}

export interface McpServerSpec {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerSpec>;
}

/**
 * When `stage` is provided, the curator MCP server is launched in review
 * mode: its `remember` tool stages proposals to `stage.stageFile` instead of
 * writing to Supermemory (see src/mcp/server.ts + src/sync/staging.ts).
 */
export function buildMcpConfig(
  curatorCliPath: string,
  stage?: { stageFile: string },
): McpConfig {
  const curatorEnv = stage
    ? { CURATOR_REMEMBER_MODE: "stage", CURATOR_STAGE_FILE: stage.stageFile }
    : undefined;

  return {
    mcpServers: {
      // Coral's built-in MCP server (read path). Verified on Windows.
      coral: { command: "coral", args: ["mcp-stdio"] },
      // Curator's own MCP server (write path). Absolute path so the config
      // works regardless of the agent's working directory.
      curator: {
        command: "node",
        args: [resolve(curatorCliPath), "mcp"],
        ...(curatorEnv ? { env: curatorEnv } : {}),
      },
    },
  };
}

/**
 * Writes ~/.curator/mcp-config.json (or an injected path for testing) so the
 * spawned agent has both Coral's MCP (read) and Curator's own MCP (write).
 * Used by the claude runtime via --mcp-config.
 */
export function writeMcpConfig(
  curatorCliPath: string,
  mcpConfigPath: string = join(homedir(), ".curator", "mcp-config.json"),
  stage?: { stageFile: string },
): string {
  mkdirSync(dirname(mcpConfigPath), { recursive: true });
  writeFileSync(mcpConfigPath, JSON.stringify(buildMcpConfig(curatorCliPath, stage), null, 2), "utf8");
  return mcpConfigPath;
}

export function agyMcpConfigPath(): string {
  return join(homedir(), ".gemini", "config", "mcp_config.json");
}

/**
 * agy has no --mcp-config flag; it reads MCP servers from its "Global
 * Configuration" file, ~/.gemini/config/mcp_config.json (same mcpServers
 * schema). CORRECTED 2026-07-18: previously written to
 * ~/.gemini/antigravity-cli/mcp_config.json, which agy 1.1.3 never reads —
 * confirmed both from the installed binary's own embedded docs (`strings`
 * output literally names ~/.gemini/config/mcp_config.json as the Global
 * Configuration path) and by a live test: writing the same content to the
 * corrected path made agy immediately spawn `coral.exe` and `node` and
 * correctly report the `remember`/`recall`/`forget`/`get_profile` MCP tools,
 * where it previously spawned nothing and reported none. See
 * docs/api-verification.md §17. Merge rather than overwrite: the user's
 * existing servers (including their own coral entry, which may pin an
 * absolute exe path) are preserved; only the `curator` entry is always ours,
 * and `coral` is added only if absent.
 */
export function writeAgyMcpConfig(
  curatorCliPath: string,
  configPath: string = agyMcpConfigPath(),
  stage?: { stageFile: string },
): string {
  let existing: Partial<McpConfig> = {};
  try {
    existing = JSON.parse(readFileSync(configPath, "utf8")) as Partial<McpConfig>;
  } catch {
    // no config yet — start fresh
  }

  const ours = buildMcpConfig(curatorCliPath, stage).mcpServers;
  const merged: McpConfig = {
    ...existing,
    mcpServers: {
      coral: ours.coral,
      ...existing.mcpServers,
      curator: ours.curator,
    },
  };

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf8");
  return configPath;
}

export interface SpawnSyncAgentOptions {
  prompt: string;
  mcpConfigPath: string;
  runtime?: AgentRuntime;
  timeoutMs?: number;
  /** Injectable for testing — real spawn cannot run without the agent CLI installed. */
  spawnFn?: typeof spawn;
}

export interface SpawnSyncAgentResult {
  stdout: string;
  timedOut: boolean;
}

/**
 * Spawns the selected headless agent runtime (claude or agy — see
 * buildAgentArgs) with a 5-minute timeout, per docs/implementation-plan.md §5.
 * The exact flag names are UNVERIFIED — see docs/api-verification.md and
 * docs/linux-test-checklist.md Part A step 7 ("confirm the actual flag names
 * via `claude -p --help` / `agy --help`").
 */
export function spawnSyncAgent(options: SpawnSyncAgentOptions): Promise<SpawnSyncAgentResult> {
  const spawnFn = options.spawnFn ?? spawn;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { command, args } = buildAgentArgs(
    options.runtime ?? "claude",
    options.prompt,
    options.mcpConfigPath,
  );

  return new Promise((resolvePromise, reject) => {
    const child: ChildProcessWithoutNullStreams = spawnFn(command, args) as ChildProcessWithoutNullStreams;

    let stdout = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", () => {
      clearTimeout(timer);
      resolvePromise({ stdout, timedOut });
    });
  });
}

export interface RunAgentSyncOptions {
  sources: string[];
  runtime?: AgentRuntime;
  /** Free-text steer for what kind of data to pull/prioritize. */
  instruction?: string;
  /**
   * Override the default per-source containerTag ("src_{source}") so every
   * memory this run stores lands in one fixed container instead — e.g.
   * routing GitHub issues into "src_github_issues", separate from PRs.
   */
  container?: string;
  /**
   * Review mode: the agent stages proposals to a local file instead of
   * writing to Supermemory. Preview them, then `curator sync --commit`.
   */
  review?: boolean;
  statePath?: string;
  stageFile?: string;
  curatorCliPath?: string;
  mcpConfigPath?: string;
  spawnFn?: typeof spawn;
}

const AGENT_SYNC_CURSOR_KEY = "agent-sync";
/** Cursor value the agent produced in review mode, applied only on --commit. */
const AGENT_SYNC_PENDING_CURSOR_KEY = "agent-sync-pending";

export async function runAgentSyncCore(options: RunAgentSyncOptions): Promise<void> {
  const runtime = options.runtime ?? "claude";
  const review = options.review ?? false;
  const cursor = getCursor(AGENT_SYNC_CURSOR_KEY, options.statePath) ?? EPOCH;
  const prompt = buildSyncPrompt(cursor, options.sources, options.instruction, options.container);
  const cliPath = options.curatorCliPath ?? process.argv[1] ?? "dist/cli.js";

  // In review mode the curator MCP server stages to this file instead of
  // writing to Supermemory. Clear it first so each run is a fresh proposal set.
  const stageFile = options.stageFile ?? defaultStageFile();
  const stage = review ? { stageFile } : undefined;
  if (review) clearStaged(stageFile);

  // claude takes the config via --mcp-config; agy only reads its own file.
  const mcpConfigPath =
    runtime === "agy"
      ? writeAgyMcpConfig(cliPath, options.mcpConfigPath, stage)
      : writeMcpConfig(cliPath, options.mcpConfigPath, stage);

  const modeNote = review ? " [review: staging, not writing]" : "";
  console.log(
    `Running sync agent (${runtime}) over sources: ${options.sources.join(", ")}${modeNote}`,
  );
  const { stdout, timedOut } = await spawnSyncAgent({
    prompt,
    mcpConfigPath,
    runtime,
    spawnFn: options.spawnFn,
  });
  const agentText = extractAgentText(runtime, stdout);
  console.log(agentText);

  if (timedOut) {
    console.warn("Sync agent timed out after 5 minutes; cursor left unchanged.");
    return;
  }

  const newCursor = parseCursorFromOutput(agentText);

  if (review) {
    // Do NOT advance the live cursor — nothing was written yet. Park the
    // cursor as pending so --commit can advance it once the staged memories
    // are actually flushed.
    const staged = readStaged(stageFile);
    if (newCursor) setCursor(AGENT_SYNC_PENDING_CURSOR_KEY, newCursor, options.statePath);

    if (staged.length > 0) {
      console.log(`\nStaged for review (${staged.length}):`);
      for (const [i, item] of staged.entries()) {
        const tag = item.containerTag ?? "curator_default";
        console.log(`  ${i + 1}. [${item.customId ?? "no customId"}] (${tag})`);
        console.log(`     ${item.content}`);
      }
    } else {
      console.log("\nNothing was staged this run.");
    }
    console.log(
      `\nStage file: ${stageFile}` +
        `\nRun \`curator sync --commit\` to write these to Supermemory` +
        `${newCursor ? ` and advance the cursor to ${newCursor}` : ""}.`,
    );
    return;
  }

  if (newCursor) {
    setCursor(AGENT_SYNC_CURSOR_KEY, newCursor, options.statePath);
  } else {
    console.warn("No CURSOR= line found in agent output; keeping the previous cursor.");
  }
}

export interface RunCommitOptions {
  statePath?: string;
  stageFile?: string;
  config?: CuratorConfig;
}

/**
 * Flushes memories staged by `curator sync --review` into Supermemory Local,
 * then advances the live cursor to the pending value the review run parked and
 * clears both the stage file and the pending cursor. This is the only part of
 * the review flow that touches Supermemory.
 */
export async function runCommit(options: RunCommitOptions = {}): Promise<{ committed: number }> {
  const stageFile = options.stageFile ?? defaultStageFile();
  const staged = readStaged(stageFile);

  if (staged.length === 0) {
    console.log("Nothing staged to commit. Run `curator sync --review` first.");
    return { committed: 0 };
  }

  const config = options.config ?? resolveConfig();

  for (const item of staged) {
    await remember(config, {
      content: item.content,
      containerTag: item.containerTag,
      customId: item.customId,
      metadata: item.metadata,
    });
  }

  const pending = getCursor(AGENT_SYNC_PENDING_CURSOR_KEY, options.statePath);
  if (pending) {
    setCursor(AGENT_SYNC_CURSOR_KEY, pending, options.statePath);
    deleteCursor(AGENT_SYNC_PENDING_CURSOR_KEY, options.statePath);
  }
  clearStaged(stageFile);

  console.log(
    `Committed ${staged.length} staged memories to Supermemory` +
      `${pending ? `; cursor advanced to ${pending}` : ""}.`,
  );
  return { committed: staged.length };
}

export interface RunAgentSyncCliOptions {
  runtime?: string;
  instruction?: string;
  container?: string;
  review?: boolean;
  /**
   * Skip the auto-printed suggestion list. The interactive menu sets this
   * because it shows suggestions itself, at the useful moment (right before
   * prompting for an instruction), rather than after the choice is made.
   */
  suppressSuggestions?: boolean;
}

/**
 * CLI-facing entry point. Sources come from CURATOR_SOURCES (comma-separated,
 * default "github"); runtime from --agent then CURATOR_AGENT then "claude";
 * instruction from --instruction then CURATOR_INSTRUCTION; container from
 * --container then CURATOR_CONTAINER (overrides the default per-source
 * "src_{source}" tag so every memory this run stores lands in one fixed
 * container). When no instruction is given, a dimmed suggestion list is
 * shown before the run so the operator learns the steering vocabulary for
 * next time.
 */
export async function runAgentSync(options: RunAgentSyncCliOptions = {}): Promise<void> {
  const sources = (process.env.CURATOR_SOURCES ?? "github").split(",").map((s) => s.trim());
  const runtime = resolveAgentRuntime(options.runtime ?? process.env.CURATOR_AGENT);
  const instruction = options.instruction ?? process.env.CURATOR_INSTRUCTION;
  const container = options.container ?? process.env.CURATOR_CONTAINER;

  if (!instruction && !options.suppressSuggestions) {
    const { formatSuggestions } = await import("./suggestions.js");
    console.log(`${formatSuggestions(sources)}\n`);
  }

  await runAgentSyncCore({ sources, runtime, instruction, container, review: options.review });
}
