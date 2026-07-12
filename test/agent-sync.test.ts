import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMcpConfig, runAgentSyncCore, writeMcpConfig } from "../src/sync/agent.js";
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

describe("buildMcpConfig", () => {
  it("wires both coral (read) and curator (write) MCP servers", () => {
    const config = buildMcpConfig("/abs/dist/cli.js");
    expect(config.mcpServers.coral).toEqual({ command: "coral", args: ["mcp-stdio"] });
    expect(config.mcpServers.curator).toEqual({ command: "node", args: ["/abs/dist/cli.js", "mcp"] });
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
    expect(parsed.mcpServers.curator.args).toEqual(["/abs/dist/cli.js", "mcp"]);
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
