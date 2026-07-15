/**
 * Curated instruction suggestions per Coral source, surfaced (dimmed) before
 * an agentic sync so the operator can steer the fetch via `--instruction`.
 *
 * Deliberately hardcoded for now — deterministic, instant, demo-safe (see
 * docs/usage.md "Suggestion layer"). The getSuggestions() boundary is the
 * upgrade point for smarter tiers later: catalog-derived (from Coral's
 * list_catalog, still no LLM) or fully live-generated (an agent samples
 * recent rows and proposes suggestions).
 */
export const SOURCE_SUGGESTIONS: Record<string, string[]> = {
  github: [
    "only merged PRs and the decisions they encode",
    "new or reopened issues with deadlines or owners",
    "release notes and breaking changes",
    "review comments that changed the direction of a PR",
  ],
  linear: [
    "tickets that changed state (started, blocked, done)",
    "new tickets with priority urgent or high",
    "scope or deadline changes on active projects",
  ],
  slack: [
    "decisions and action items from team channels",
    "announcements and policy changes",
    "threads where a blocker was raised or resolved",
  ],
  sentry: [
    "new or regressed errors above 100 events",
    "issues assigned or resolved this period",
  ],
  datadog: [
    "monitors that changed state (alerting, recovered)",
    "new incidents and their root-cause notes",
  ],
  stripe: [
    "failed payments and disputed charges",
    "new subscriptions, upgrades, and cancellations",
  ],
};

const GENERIC_SUGGESTIONS = [
  "only items updated since the last sync that a teammate would want summarized",
  "decisions, ownership changes, and deadlines — skip routine chatter",
];

/**
 * Returns suggestions for the given sources, deduplicated, capped at `limit`.
 * Unknown sources fall back to generic suggestions so the layer never renders
 * empty.
 */
export function getSuggestions(sources: string[], limit = 6): string[] {
  const collected: string[] = [];
  for (const source of sources) {
    for (const suggestion of SOURCE_SUGGESTIONS[source.trim().toLowerCase()] ?? []) {
      if (!collected.includes(suggestion)) collected.push(suggestion);
    }
  }
  if (collected.length === 0) collected.push(...GENERIC_SUGGESTIONS);
  return collected.slice(0, limit);
}

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/**
 * Renders the suggestion block in dim/faint ANSI (the terminal's version of
 * "translucent"). Plain text when the stream isn't a TTY so logs stay clean.
 */
export function formatSuggestions(sources: string[], useColor = process.stdout.isTTY ?? false): string {
  const suggestions = getSuggestions(sources);
  const lines = [
    "Suggestions — steer this sync with --instruction (or CURATOR_INSTRUCTION):",
    ...suggestions.map((s) => `  · "${s}"`),
  ];
  const text = lines.join("\n");
  return useColor ? `${DIM}${text}${RESET}` : text;
}
