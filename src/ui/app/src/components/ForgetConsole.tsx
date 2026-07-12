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
    <div data-testid="forget-console">
      <input
        type="text"
        value={query}
        placeholder="e.g. everything about client X"
        onChange={(e) => onQueryChange(e.target.value)}
        data-testid="forget-input"
      />
      <button type="button" onClick={onPreview} disabled={!query || previewing} data-testid="forget-preview-button">
        {previewing ? "Previewing…" : "Preview"}
      </button>

      {preview ? (
        <div data-testid="forget-preview">
          <p>{preview.summary ?? preview.note ?? `${preview.count ?? 0} memories would be forgotten`}</p>
          {preview.candidates && preview.candidates.length > 0 ? (
            <ul>
              {preview.candidates.map((c) => (
                <li key={c.id}>{c.memory}</li>
              ))}
            </ul>
          ) : null}
          <button type="button" onClick={onConfirm} data-testid="forget-confirm-button">
            Confirm deletion
          </button>
        </div>
      ) : null}

      {actionLog.length > 0 ? (
        <ul data-testid="forget-action-log">
          {actionLog.map((entry, i) => (
            <li key={i}>{entry}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
