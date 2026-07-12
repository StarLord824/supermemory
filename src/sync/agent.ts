import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { getCursor, setCursor } from "../state.js";
import { buildSyncPrompt, parseCursorFromOutput } from "./prompt.js";

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
 *   `-p <prompt>` (plain-text output) and reads MCP servers from
 *   ~/.gemini/antigravity-cli/mcp_config.json — see writeAgyMcpConfig.
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

export interface McpConfig {
  mcpServers: Record<string, { command: string; args: string[] }>;
}

export function buildMcpConfig(curatorCliPath: string): McpConfig {
  return {
    mcpServers: {
      // Coral's built-in MCP server (read path). `coral mcp-stdio` is
      // UNVERIFIED — confirm the subcommand via `coral --help` on Linux.
      coral: { command: "coral", args: ["mcp-stdio"] },
      // Curator's own MCP server (write path). Absolute path so the config
      // works regardless of the agent's working directory.
      curator: { command: "node", args: [resolve(curatorCliPath), "mcp"] },
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
): string {
  mkdirSync(dirname(mcpConfigPath), { recursive: true });
  writeFileSync(mcpConfigPath, JSON.stringify(buildMcpConfig(curatorCliPath), null, 2), "utf8");
  return mcpConfigPath;
}

export function agyMcpConfigPath(): string {
  return join(homedir(), ".gemini", "antigravity-cli", "mcp_config.json");
}

/**
 * agy has no --mcp-config flag; it reads MCP servers from its own
 * ~/.gemini/antigravity-cli/mcp_config.json (same mcpServers schema —
 * verified on Windows, docs/api-verification.md §11). Merge rather than
 * overwrite: the user's existing servers (including their own coral entry,
 * which may pin an absolute exe path) are preserved; only the `curator`
 * entry is always ours, and `coral` is added only if absent.
 */
export function writeAgyMcpConfig(
  curatorCliPath: string,
  configPath: string = agyMcpConfigPath(),
): string {
  let existing: Partial<McpConfig> = {};
  try {
    existing = JSON.parse(readFileSync(configPath, "utf8")) as Partial<McpConfig>;
  } catch {
    // no config yet — start fresh
  }

  const ours = buildMcpConfig(curatorCliPath).mcpServers;
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
  statePath?: string;
  curatorCliPath?: string;
  mcpConfigPath?: string;
  spawnFn?: typeof spawn;
}

const AGENT_SYNC_CURSOR_KEY = "agent-sync";

export async function runAgentSyncCore(options: RunAgentSyncOptions): Promise<void> {
  const runtime = options.runtime ?? "claude";
  const cursor = getCursor(AGENT_SYNC_CURSOR_KEY, options.statePath) ?? EPOCH;
  const prompt = buildSyncPrompt(cursor, options.sources);
  const cliPath = options.curatorCliPath ?? process.argv[1] ?? "dist/cli.js";

  // claude takes the config via --mcp-config; agy only reads its own file.
  const mcpConfigPath =
    runtime === "agy"
      ? writeAgyMcpConfig(cliPath, options.mcpConfigPath)
      : writeMcpConfig(cliPath, options.mcpConfigPath);

  console.log(`Running sync agent (${runtime}) over sources: ${options.sources.join(", ")}`);
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
  if (newCursor) {
    setCursor(AGENT_SYNC_CURSOR_KEY, newCursor, options.statePath);
  } else {
    console.warn("No CURSOR= line found in agent output; keeping the previous cursor.");
  }
}

/**
 * CLI-facing entry point. Sources come from CURATOR_SOURCES (comma-separated,
 * default "github"); the runtime from the --agent CLI option, falling back to
 * the CURATOR_AGENT env var, then "claude".
 */
export async function runAgentSync(runtimeArg?: string): Promise<void> {
  const sources = (process.env.CURATOR_SOURCES ?? "github").split(",").map((s) => s.trim());
  const runtime = resolveAgentRuntime(runtimeArg ?? process.env.CURATOR_AGENT);
  await runAgentSyncCore({ sources, runtime });
}
