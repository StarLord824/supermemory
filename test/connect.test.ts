import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { connectSource } from "../src/connect.js";

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
