/**
 * Sync agent prompt template, per docs/implementation-plan.md §5. Filled with
 * the current cursor and the list of connected Coral sources. An optional
 * free-text `instruction` (from `curator sync --instruction` / CURATOR_INSTRUCTION)
 * lets the operator steer what kind of data to pull and prioritize.
 */
export function buildSyncPrompt(cursor: string, sources: string[], instruction?: string): string {
  const focus = instruction?.trim()
    ? `\nFOCUS — the operator specifically wants: ${instruction.trim()}\nPrioritize items matching this focus; when it narrows scope, skip items that fall outside it even if they would otherwise qualify.\n`
    : "";

  return `You are Curator's sync agent. Your job: pull what changed in connected sources and store ONLY durable, useful memories in Supermemory Local.
${focus}
PROTOCOL — follow exactly:
1. Discover schema with the coral \`list_catalog\` / \`describe_table\` tools (or \`sql\` on coral.tables) for sources: ${sources.join(", ")}.
2. Fetch changes since ${cursor} with the coral \`sql\` tool. Select minimal columns. LIMIT 50.
3. For each item, decide: is this worth remembering long-term (decisions, status changes, new issues/PRs, ownership, deadlines)? Skip noise (bot comments, CI chatter, trivial edits).
4. Store each keeper with the curator \`remember\` tool:
   - customId: "{source}:{type}:{native_id}"  (MANDATORY — prevents duplicates)
   - containerTag: "src_{source}"
   - content: 1–3 sentence self-contained summary a future agent can use without the original.
5. Do NOT call forget. Do NOT store secrets, tokens, or emails.
6. Finish with a report: items scanned, stored (with customIds), skipped and why, and the new cursor value = max updated_at you saw, ISO format, on its own final line as: CURSOR=<iso>.`;
}

const CURSOR_LINE_RE = /^CURSOR=(.+)$/m;

/**
 * Parses the trailing `CURSOR=<iso>` line from agent output. Returns null
 * (rather than throwing) if the line is absent or the value isn't a valid
 * date, per docs/implementation-plan.md §5: "if absent or malformed, keep
 * old cursor and warn."
 */
export function parseCursorFromOutput(output: string): string | null {
  const match = output.match(CURSOR_LINE_RE);
  if (!match) return null;
  const iso = match[1].trim();
  if (Number.isNaN(Date.parse(iso))) return null;
  return iso;
}
