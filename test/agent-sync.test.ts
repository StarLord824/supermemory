import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAgentArgs,
  buildMcpConfig,
  extractAgentText,
  resolveAgentRuntime,
  runAgentSyncCore,
  writeAgyMcpConfig,
  writeMcpConfig,
} from "../src/sync/agent.js";
import { getCursor, setCursor } from "../src/state.js";

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  kill = vi.fn();
}

function fakeSpawnFn(stdoutText: string) {
  const child = new FakeChildProcess();
  const spawnFn = vi.fn(() => {
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(stdoutText));
      child.emit("close");
    });
    return child as unknown as ReturnType<typeof import("node:child_process").spawn>;
  });
  return spawnFn;
}

describe("resolveAgentRuntime", () => {
  it("defaults to claude when unset", () => {
    expect(resolveAgentRuntime(undefined)).toBe("claude");
  });

  it("accepts agy (case-insensitive)", () => {
    expect(resolveAgentRuntime("AGY")).toBe("agy");
  });

  it("rejects unknown runtimes with an actionable error", () => {
    expect(() => resolveAgentRuntime("gemini")).toThrow(/Supported: claude, agy/);
  });
});

describe("buildAgentArgs", () => {
  it("builds the verified claude -p invocation (strict mcp config, scoped tool allowlist, json output)", () => {
    const { command, args } = buildAgentArgs("claude", "do the sync", "/tmp/mcp.json");
    expect(command).toBe("claude");
    expect(args).toEqual([
      "-p",
      "do the sync",
      "--mcp-config",
      "/tmp/mcp.json",
      "--strict-mcp-config",
      "--allowedTools",
      "mcp__coral",
      "mcp__curator",
      "--output-format",
      "json",
    ]);
    // --max-turns was removed from claude 2.1.207 and must not be passed
    expect(args).not.toContain("--max-turns");
  });

  it("builds the verified agy invocation — no --mcp-config (agy reads its own config file)", () => {
    const { command, args } = buildAgentArgs("agy", "do the sync", "/tmp/mcp.json");
    expect(command).toBe("agy");
    expect(args).toEqual(["-p", "do the sync", "--dangerously-skip-permissions"]);
  });
});

describe("extractAgentText", () => {
  it("unwraps claude's json envelope to the result field", () => {
    const stdout = JSON.stringify({ type: "result", result: "stored 2\nCURSOR=2026-07-12T10:00:00Z" });
    expect(extractAgentText("claude", stdout)).toBe("stored 2\nCURSOR=2026-07-12T10:00:00Z");
  });

  it("falls back to raw stdout when claude output isn't a json envelope", () => {
    expect(extractAgentText("claude", "plain text out")).toBe("plain text out");
  });

  it("passes agy's plain-text output through untouched", () => {
    const stdout = "stored 1\nCURSOR=2026-07-12T11:00:00Z";
    expect(extractAgentText("agy", stdout)).toBe(stdout);
  });
});

describe("buildMcpConfig", () => {
  it("wires both coral (read) and curator (write) MCP servers with an absolute cli path", () => {
    const config = buildMcpConfig("/abs/dist/cli.js");
    expect(config.mcpServers.coral).toEqual({ command: "coral", args: ["mcp-stdio"] });
    expect(config.mcpServers.curator).toEqual({
      command: "node",
      args: [resolve("/abs/dist/cli.js"), "mcp"],
    });
  });

  it("resolves a relative cli path to absolute so the config works from any cwd", () => {
    const config = buildMcpConfig("dist/cli.js");
    expect(config.mcpServers.curator.args[0]).toBe(resolve("dist/cli.js"));
  });
});

describe("writeMcpConfig", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes the config JSON to the given path, creating parent dirs", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-mcp-config-"));
    const configPath = join(tmpDir, "nested", "mcp-config.json");

    const written = writeMcpConfig("/abs/dist/cli.js", configPath);

    expect(written).toBe(configPath);
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    expect(parsed.mcpServers.curator.args).toEqual([resolve("/abs/dist/cli.js"), "mcp"]);
  });
});

describe("writeAgyMcpConfig", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("merges into an existing agy config, preserving user servers and their coral entry", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-agy-config-"));
    const configPath = join(tmpDir, "mcp_config.json");
    const userCoral = { command: "C:\\Users\\me\\.local\\bin\\coral.exe", args: ["mcp-stdio"] };
    writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { coral: userCoral, sentry: { command: "sentry-mcp", args: [] } } }),
    );

    writeAgyMcpConfig("/abs/dist/cli.js", configPath);

    const merged = JSON.parse(readFileSync(configPath, "utf8"));
    expect(merged.mcpServers.coral).toEqual(userCoral); // user's pinned path wins
    expect(merged.mcpServers.sentry).toEqual({ command: "sentry-mcp", args: [] });
    expect(merged.mcpServers.curator).toEqual({
      command: "node",
      args: [resolve("/abs/dist/cli.js"), "mcp"],
    });
  });

  it("creates the config with coral and curator when none exists", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-agy-config-"));
    const configPath = join(tmpDir, "nested", "mcp_config.json");

    writeAgyMcpConfig("/abs/dist/cli.js", configPath);

    const created = JSON.parse(readFileSync(configPath, "utf8"));
    expect(created.mcpServers.coral).toEqual({ command: "coral", args: ["mcp-stdio"] });
    expect(created.mcpServers.curator.command).toBe("node");
  });
});

describe("runAgentSyncCore", () => {
  let tmpDir: string;
  let statePath: string;
  let mcpConfigPath: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  function freshPaths() {
    tmpDir = mkdtempSync(join(tmpdir(), "curator-agent-sync-"));
    statePath = join(tmpDir, "state.json");
    mcpConfigPath = join(tmpDir, "mcp-config.json");
  }

  it("advances the cursor when the agent reports a valid CURSOR= line", async () => {
    freshPaths();
    const spawnFn = fakeSpawnFn("stored 2 items\nCURSOR=2026-07-12T10:00:00Z");

    await runAgentSyncCore({
      sources: ["github"],
      statePath,
      mcpConfigPath,
      curatorCliPath: "/abs/dist/cli.js",
      spawnFn: spawnFn as unknown as typeof import("node:child_process").spawn,
    });

    expect(getCursor("agent-sync", statePath)).toBe("2026-07-12T10:00:00Z");
    expect(spawnFn.mock.calls[0][0]).toBe("claude");
  });

  it("parses the cursor out of claude's json envelope output", async () => {
    freshPaths();
    const envelope = JSON.stringify({
      type: "result",
      result: "stored 3 items\nCURSOR=2026-07-12T12:00:00Z",
    });
    const spawnFn = fakeSpawnFn(envelope);

    await runAgentSyncCore({
      sources: ["github"],
      statePath,
      mcpConfigPath,
      curatorCliPath: "/abs/dist/cli.js",
      spawnFn: spawnFn as unknown as typeof import("node:child_process").spawn,
    });

    expect(getCursor("agent-sync", statePath)).toBe("2026-07-12T12:00:00Z");
  });

  it("spawns the agy runtime when selected", async () => {
    freshPaths();
    const spawnFn = fakeSpawnFn("stored 1 item\nCURSOR=2026-07-12T11:00:00Z");

    await runAgentSyncCore({
      sources: ["github", "linear"],
      runtime: "agy",
      statePath,
      mcpConfigPath,
      curatorCliPath: "/abs/dist/cli.js",
      spawnFn: spawnFn as unknown as typeof import("node:child_process").spawn,
    });

    expect(spawnFn.mock.calls[0][0]).toBe("agy");
    expect(getCursor("agent-sync", statePath)).toBe("2026-07-12T11:00:00Z");
  });

  it("keeps the previous cursor when the agent output has no CURSOR= line", async () => {
    freshPaths();
    setCursor("agent-sync", "2026-07-01T00:00:00Z", statePath);
    const spawnFn = fakeSpawnFn("stored 2 items, no trailing cursor");

    await runAgentSyncCore({
      sources: ["github"],
      statePath,
      mcpConfigPath,
      curatorCliPath: "/abs/dist/cli.js",
      spawnFn: spawnFn as unknown as typeof import("node:child_process").spawn,
    });

    expect(getCursor("agent-sync", statePath)).toBe("2026-07-01T00:00:00Z");
  });
});
