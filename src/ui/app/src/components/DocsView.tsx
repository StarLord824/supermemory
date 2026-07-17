export function DocsView() {
  return (
    <div data-testid="docs-view" className="space-y-6 text-sm text-ink-muted">
      <section>
        <h3 className="mb-2 font-display text-base text-ink">CLI commands</h3>
        <dl className="space-y-2">
          <div>
            <dt className="font-mono text-ink">curator mcp</dt>
            <dd>Runs the stdio MCP server (remember/recall/forget/get_profile).</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">curator status</dt>
            <dd>Prints resolved config and probes the Supermemory Local server.</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">curator tags</dt>
            <dd>Lists container tags found in Supermemory Local, with a document count each.</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">curator sync [--raw|--review|--commit]</dt>
            <dd>Pulls data from connected agentic sources into Supermemory Local.</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">curator connect &lt;source...&gt;</dt>
            <dd>Wires up a Coral source (github, linear, slack, ...).</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">curator ui [--port]</dt>
            <dd>Serves this governance console.</dd>
          </div>
        </dl>
      </section>
      <section>
        <h3 className="mb-2 font-display text-base text-ink">MCP tools</h3>
        <dl className="space-y-2">
          <div>
            <dt className="font-mono text-ink">remember</dt>
            <dd>Stores a new memory under a container tag.</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">recall</dt>
            <dd>Semantic search over stored memories.</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">forget</dt>
            <dd>Deletes matching memories. Dry-run by default — deletion requires an explicit opt-out.</dd>
          </div>
          <div>
            <dt className="font-mono text-ink">get_profile</dt>
            <dd>Returns the static/dynamic profile derived from stored memories.</dd>
          </div>
        </dl>
      </section>
      <section>
        <h3 className="mb-2 font-display text-base text-ink">Console tabs</h3>
        <dl className="space-y-2">
          <div>
            <dt className="text-ink">Home</dt>
            <dd>Overview stats for the active container tag.</dd>
          </div>
          <div>
            <dt className="text-ink">Memories</dt>
            <dd>Browse stored memories, with version-chain relations where available.</dd>
          </div>
          <div>
            <dt className="text-ink">Review</dt>
            <dd>Approve or decline low-confidence inferred memories (only shown when the server supports it).</dd>
          </div>
          <div>
            <dt className="text-ink">Forget</dt>
            <dd>Always previews matching memories before any deletion.</dd>
          </div>
          <div>
            <dt className="text-ink">Graph</dt>
            <dd>Visualizes documents and their memories.</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
