import type { ForgetPreview } from "../api.js";

export interface ForgetConsoleProps {
  query: string;
  onQueryChange: (value: string) => void;
  onPreview: () => void;
  preview: ForgetPreview | null;
  onConfirm: () => void;
  actionLog: string[];
  previewing?: boolean;
}

/**
 * Always previews (dry-run) before any deletion; "Confirm deletion" only
 * appears once a preview exists, and only fires the dryRun:false call when
 * clicked explicitly — never as a side effect of preview. See
 * docs/implementation-plan.md §6.
 */
export function ForgetConsole({
  query,
  onQueryChange,
  onPreview,
  preview,
  onConfirm,
  actionLog,
  previewing,
}: ForgetConsoleProps) {
  return (
    <div data-testid="forget-console" className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          placeholder="e.g. everything about client X"
          onChange={(e) => onQueryChange(e.target.value)}
          data-testid="forget-input"
          className="flex-1 rounded-lg border border-hairline bg-elevated px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-blue focus:outline-none"
        />
        <button
          type="button"
          onClick={onPreview}
          disabled={!query || previewing}
          data-testid="forget-preview-button"
          className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink hover:bg-white/5 disabled:opacity-40"
        >
          {previewing ? "Previewing…" : "Preview"}
        </button>
      </div>

      {preview ? (
        <div data-testid="forget-preview" className="rounded-xl border border-hairline bg-elevated p-4">
          <p className="text-sm text-ink">
            {preview.summary ?? preview.note ?? `${preview.count ?? 0} memories would be forgotten`}
          </p>
          {preview.candidates && preview.candidates.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {preview.candidates.map((c) => (
                <li key={c.id} className="text-sm text-ink-muted">
                  {c.memory}
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={onConfirm}
            data-testid="forget-confirm-button"
            className="mt-4 rounded-lg bg-accent-red px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Confirm deletion
          </button>
        </div>
      ) : null}

      {actionLog.length > 0 ? (
        <ul data-testid="forget-action-log" className="space-y-1 border-t border-hairline pt-3">
          {actionLog.map((entry, i) => (
            <li key={i} className="font-mono text-xs text-ink-faint">
              {entry}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
