import { appendFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * A memory the sync agent proposed while running in review mode. Instead of
 * writing straight to Supermemory, the curator `remember` MCP tool appends
 * these to a JSONL stage file so a human can preview them before
 * `curator sync --commit` flushes them. See docs/plan.md §3 (Component B:
 * "agents ingest autonomously, humans supervise").
 */
export interface StagedMemory {
  content: string;
  containerTag?: string;
  customId?: string;
  metadata?: Record<string, unknown>;
  stagedAt: string;
}

export type StageMemoryInput = Omit<StagedMemory, "stagedAt">;

export function defaultStageFile(): string {
  return join(homedir(), ".curator", "staged.jsonl");
}

export function stageMemory(
  input: StageMemoryInput,
  stageFile: string = defaultStageFile(),
): StagedMemory {
  const entry: StagedMemory = { ...input, stagedAt: new Date().toISOString() };
  mkdirSync(dirname(stageFile), { recursive: true });
  appendFileSync(stageFile, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export function readStaged(stageFile: string = defaultStageFile()): StagedMemory[] {
  try {
    return readFileSync(stageFile, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as StagedMemory);
  } catch {
    return [];
  }
}

export function clearStaged(stageFile: string = defaultStageFile()): void {
  try {
    rmSync(stageFile);
  } catch {
    // already absent — nothing to clear
  }
}
