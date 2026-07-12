import { mkdirSync, writeFileSync } from "node:fs";
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
 * Builds the headless invocation for each runtime.
 *
 * - claude: `claude -p <prompt> --mcp-config <path> --output-format json --max-turns 25`
 *   per docs/implementation-plan.md §5.
 * - agy (Antigravity CLI): mirrored headless flags. UNVERIFIED — confirm the
 *   real flag names via `agy --help` on Linux (docs/linux-test-checklist.md
 *   Part A step 7) and adjust here; this is the only place they are named.
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
          "--output-format",
          "json",
          "--max-turns",
          "25",
        ],
      };
    case "agy":
      return {
        command: "agy",
        args: ["-p", prompt, "--mcp-config", mcpConfigPath, "--output-format", "json"],
      };
  }
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
 */
export function writeMcpConfig(
  curatorCliPath: string,
  mcpConfigPath: string = join(homedir(), ".curator", "mcp-config.json"),
): string {
  mkdirSync(dirname(mcpConfigPath), { recursive: true });
  writeFileSync(mcpConfigPath, JSON.stringify(buildMcpConfig(curatorCliPath), null, 2), "utf8");
  return mcpConfigPath;
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
  const mcpConfigPath = writeMcpConfig(
    options.curatorCliPath ?? process.argv[1] ?? "dist/cli.js",
    options.mcpConfigPath,
  );

  console.log(`Running sync agent (${runtime}) over sources: ${options.sources.join(", ")}`);
  const { stdout, timedOut } = await spawnSyncAgent({
    prompt,
    mcpConfigPath,
    runtime,
    spawnFn: options.spawnFn,
  });
  console.log(stdout);

  if (timedOut) {
    console.warn("Sync agent timed out after 5 minutes; cursor left unchanged.");
    return;
  }

  const newCursor = parseCursorFromOutput(stdout);
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
