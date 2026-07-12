import { mkdirSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getCursor, setCursor } from "../state.js";
import { buildSyncPrompt, parseCursorFromOutput } from "./prompt.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const EPOCH = new Date(0).toISOString();

export interface McpConfig {
  mcpServers: Record<string, { command: string; args: string[] }>;
}

export function buildMcpConfig(curatorCliPath: string): McpConfig {
  return {
    mcpServers: {
      coral: { command: "coral", args: ["mcp-stdio"] },
      curator: { command: "node", args: [curatorCliPath, "mcp"] },
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
  timeoutMs?: number;
  /** Injectable for testing — real spawn cannot run without the `claude` CLI installed. */
  spawnFn?: typeof spawn;
}

export interface SpawnSyncAgentResult {
  stdout: string;
  timedOut: boolean;
}

/**
 * Spawns `claude -p <prompt> --mcp-config <path> --output-format json
 * --max-turns 25` with a 5-minute timeout, per docs/implementation-plan.md §5.
 * The exact flag names are UNVERIFIED — see docs/api-verification.md and
 * docs/linux-test-checklist.md Part A step 7 ("confirm the actual
 * --mcp-config and --max-turns flag names via `claude -p --help`").
 */
export function spawnSyncAgent(options: SpawnSyncAgentOptions): Promise<SpawnSyncAgentResult> {
  const spawnFn = options.spawnFn ?? spawn;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawnFn("claude", [
      "-p",
      options.prompt,
      "--mcp-config",
      options.mcpConfigPath,
      "--output-format",
      "json",
      "--max-turns",
      "25",
    ]) as ChildProcessWithoutNullStreams;

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
      resolve({ stdout, timedOut });
    });
  });
}

export interface RunAgentSyncOptions {
  sources: string[];
  statePath?: string;
  curatorCliPath?: string;
  mcpConfigPath?: string;
  spawnFn?: typeof spawn;
}

const AGENT_SYNC_CURSOR_KEY = "agent-sync";

export async function runAgentSyncCore(options: RunAgentSyncOptions): Promise<void> {
  const cursor = getCursor(AGENT_SYNC_CURSOR_KEY, options.statePath) ?? EPOCH;
  const prompt = buildSyncPrompt(cursor, options.sources);
  const mcpConfigPath = writeMcpConfig(
    options.curatorCliPath ?? process.argv[1] ?? "dist/cli.js",
    options.mcpConfigPath,
  );

  const { stdout, timedOut } = await spawnSyncAgent({ prompt, mcpConfigPath, spawnFn: options.spawnFn });
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

/** CLI-facing entry point: resolves connected sources from CURATOR_SOURCES (comma-separated). */
export async function runAgentSync(): Promise<void> {
  const sources = (process.env.CURATOR_SOURCES ?? "github").split(",").map((s) => s.trim());
  await runAgentSyncCore({ sources });
}
