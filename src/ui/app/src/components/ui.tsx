import type { ReactNode } from "react";

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-hairline bg-surface p-5 ${className}`}>
      {title ? <h2 className="mb-4 font-display text-lg font-medium text-ink">{title}</h2> : null}
      {children}
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-white/5 text-ink-muted",
  blue: "bg-accent-blue/15 text-accent-blue",
  green: "bg-accent-green/15 text-accent-green",
  red: "bg-accent-red/15 text-accent-red",
} as const;

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
}) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="tablist" className="inline-flex gap-1 rounded-xl border border-hairline bg-surface p-1">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              selected ? "bg-elevated text-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TagPicker({
  value,
  tags,
  onChange,
}: {
  value: string;
  tags: { tag: string; documentCount: number }[];
  onChange: (tag: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      Container tag
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list="known-container-tags"
        data-testid="tag-input"
        className="rounded-lg border border-hairline bg-elevated px-3 py-1.5 font-mono text-sm text-ink focus:border-accent-blue focus:outline-none"
      />
      <datalist id="known-container-tags" data-testid="tag-suggestions">
        {tags.map((t) => (
          <option key={t.tag} value={t.tag} />
        ))}
      </datalist>
    </label>
  );
}
