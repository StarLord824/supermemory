export interface GithubIssueRow {
  number: number;
  title: string;
  state: string;
  body: string | null;
  html_url: string;
  updated_at: string;
}

export interface MappedMemory {
  content: string;
  customId: string;
  containerTag: string;
  metadata: Record<string, unknown>;
}

const MAX_BODY_LENGTH = 2000;

/**
 * Row -> Supermemory document mapping for GitHub issues/PRs, per
 * docs/implementation-plan.md §4. Pure function, fully unit-testable
 * against fixture rows with no live Coral or Supermemory dependency.
 */
export function mapGithubIssueRow(row: GithubIssueRow): MappedMemory {
  const body = (row.body ?? "").slice(0, MAX_BODY_LENGTH);
  const content = `[GitHub issue #${row.number}] ${row.title} — ${row.state}\n${body}\n${row.html_url}`;

  return {
    content,
    customId: `github:issue:${row.number}`,
    containerTag: "src_github",
    metadata: {
      source: "github",
      type: "issue",
      url: row.html_url,
      updatedAt: row.updated_at,
    },
  };
}
