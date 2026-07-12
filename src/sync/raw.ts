import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type Supermemory from "supermemory";
import { getCursor, setCursor } from "../state.js";
import { createClient } from "../supermemory/client.js";
import { resolveConfig, type CuratorConfig } from "../config.js";
import { remember } from "../supermemory/ops.js";
import { mapGithubIssueRow, type GithubIssueRow } from "./mapping.js";

const execFileAsync = promisify(execFile);
const EPOCH = new Date(0).toISOString();

export function buildGithubQuery(owner: string, repo: string, since: string): string {
  return (
    `SELECT number, title, state, body, html_url, updated_at FROM github.issues ` +
    `WHERE owner='${owner}' AND repo='${repo}' AND updated_at > '${since}' LIMIT 200`
  );
}

/**
 * Shells out to the Coral CLI. The `--format json` flag is UNVERIFIED — see
 * docs/api-verification.md and docs/linux-test-checklist.md Part A step 6,
 * which instructs confirming the real flag via `coral sql --help` on Linux.
 */
export async function queryCoralGithubIssues(sqlQuery: string): Promise<GithubIssueRow[]> {
  const { stdout } = await execFileAsync("coral", ["sql", sqlQuery, "--format", "json"]);
  return JSON.parse(stdout) as GithubIssueRow[];
}

export interface SyncGithubRawOptions {
  owner: string;
  repo: string;
  statePath?: string;
  config?: CuratorConfig;
  client?: Supermemory;
  fetchRows?: (sqlQuery: string) => Promise<GithubIssueRow[]>;
}

export interface SyncGithubRawResult {
  stored: number;
  newCursor: string;
}

/**
 * Deterministic, no-agent sync: fixed Coral SQL query -> map -> remember,
 * with customId-based idempotency. Injectable config/client/fetchRows make
 * this fully testable against fixture rows with no live Coral or
 * Supermemory dependency.
 */
export async function syncGithubRaw(options: SyncGithubRawOptions): Promise<SyncGithubRawResult> {
  const cursor = getCursor("github", options.statePath) ?? EPOCH;
  const query = buildGithubQuery(options.owner, options.repo, cursor);
  const fetchRows = options.fetchRows ?? queryCoralGithubIssues;
  const rows = await fetchRows(query);

  const config = options.config ?? resolveConfig();
  const client = options.client ?? createClient(config);

  let maxUpdatedAt = cursor;
  for (const row of rows) {
    await remember(client, mapGithubIssueRow(row));
    if (row.updated_at > maxUpdatedAt) maxUpdatedAt = row.updated_at;
  }

  if (rows.length > 0) {
    setCursor("github", maxUpdatedAt, options.statePath);
  }

  return { stored: rows.length, newCursor: maxUpdatedAt };
}

/** CLI-facing entry point: resolves GitHub owner/repo from the environment. */
export async function runRawSync(): Promise<void> {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!owner || !repo) {
    throw new Error(
      "GITHUB_OWNER and GITHUB_REPO must be set to run `curator sync --raw` (see docs/roadmap.md Phase 2).",
    );
  }

  const result = await syncGithubRaw({ owner, repo });
  console.log(`Stored ${result.stored} memories from github.com/${owner}/${repo}. Cursor now ${result.newCursor}.`);
}
