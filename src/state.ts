import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CuratorState {
  cursors: Record<string, string>;
  settings: Record<string, unknown>;
}

const DEFAULT_STATE: CuratorState = { cursors: {}, settings: {} };

function defaultStatePath(): string {
  return join(homedir(), ".curator", "state.json");
}

export function readState(statePath: string = defaultStatePath()): CuratorState {
  try {
    const raw = readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      cursors: parsed.cursors ?? {},
      settings: parsed.settings ?? {},
    };
  } catch {
    return { ...DEFAULT_STATE, cursors: {}, settings: {} };
  }
}

export function writeState(
  state: CuratorState,
  statePath: string = defaultStatePath(),
): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

export function getCursor(source: string, statePath?: string): string | undefined {
  return readState(statePath).cursors[source];
}

export function setCursor(source: string, iso: string, statePath?: string): void {
  const state = readState(statePath);
  state.cursors[source] = iso;
  writeState(state, statePath);
}

export function deleteCursor(source: string, statePath?: string): void {
  const state = readState(statePath);
  delete state.cursors[source];
  writeState(state, statePath);
}
