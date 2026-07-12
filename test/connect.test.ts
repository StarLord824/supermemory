import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectSource, connectSources } from "../src/connect.js";

class FakeChildProcess extends EventEmitter {}

function fakeSpawnFn(exitCode: number | null, error?: Error) {
  const child = new FakeChildProcess();
  const spawnFn = vi.fn((_cmd: string, _args: string[]) => {
    queueMicrotask(() => {
      if (error) {
        child.emit("error", error);
      } else {
        child.emit("close", exitCode);
      }
    });
    return child as unknown as ReturnType<typeof import("node:child_process").spawn>;
  });
  return spawnFn;
}

describe("connectSource", () => {
  it("invokes coral with the interactive add args for the given source", async () => {
    const spawnFn = fakeSpawnFn(0);

    await connectSource("github", spawnFn as unknown as typeof import("node:child_process").spawn);

    expect(spawnFn).toHaveBeenCalledWith(
      "coral",
      ["source", "add", "--interactive", "github"],
      expect.objectContaining({ stdio: "inherit" }),
    );
  });

  it("resolves when coral exits 0", async () => {
    const spawnFn = fakeSpawnFn(0);
    await expect(
      connectSource("github", spawnFn as unknown as typeof import("node:child_process").spawn),
    ).resolves.toBeUndefined();
  });

  it("rejects with the exit code when coral fails", async () => {
    const spawnFn = fakeSpawnFn(1);
    await expect(
      connectSource("github", spawnFn as unknown as typeof import("node:child_process").spawn),
    ).rejects.toThrow(/exited with code 1/);
  });

  it("rejects with an actionable message when coral isn't installed", async () => {
    const spawnFn = fakeSpawnFn(null, new Error("ENOENT"));
    await expect(
      connectSource("github", spawnFn as unknown as typeof import("node:child_process").spawn),
    ).rejects.toThrow(/Is Coral installed/);
  });
});

/** Spawn fake that hands out a fresh child per call, with per-call exit codes. */
function fakeMultiSpawnFn(exitCodes: number[]) {
  let call = 0;
  const spawnFn = vi.fn((_cmd: string, _args: string[]) => {
    const child = new FakeChildProcess();
    const exitCode = exitCodes[call++] ?? 0;
    queueMicrotask(() => child.emit("close", exitCode));
    return child as unknown as ReturnType<typeof import("node:child_process").spawn>;
  });
  return spawnFn;
}

describe("connectSources", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the wizard sequentially for each source", async () => {
    const spawnFn = fakeMultiSpawnFn([0, 0, 0]);

    await connectSources(
      ["github", "linear", "slack"],
      spawnFn as unknown as typeof import("node:child_process").spawn,
    );

    expect(spawnFn).toHaveBeenCalledTimes(3);
    expect(spawnFn.mock.calls.map((c) => c[1][3])).toEqual(["github", "linear", "slack"]);
  });

  it("stops at the first failing source and does not start the next wizard", async () => {
    const spawnFn = fakeMultiSpawnFn([0, 1, 0]);

    await expect(
      connectSources(
        ["github", "linear", "slack"],
        spawnFn as unknown as typeof import("node:child_process").spawn,
      ),
    ).rejects.toThrow(/linear exited with code 1/);

    expect(spawnFn).toHaveBeenCalledTimes(2);
  });

  it("warns about (but still attempts) sources outside the documented set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const spawnFn = fakeMultiSpawnFn([0]);

    await connectSources(
      ["jira"],
      spawnFn as unknown as typeof import("node:child_process").spawn,
    );

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"jira"'));
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });
});
