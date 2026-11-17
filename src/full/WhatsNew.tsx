import { useState } from "react";

import type { ChangelogEntry, ChangelogSection } from "../lib/changelog";
import { ChevronRight } from "../components/icons";

interface Props {
  /** The running version, named in the title. */
  version: string;
  /** Newest first, from CHANGELOG.md (see `planWhatsNew`). */
  entries: ChangelogEntry[];
  /** Older versions were left off the card. */
  more: boolean;
  onDone: () => void;
}

/**
 * The card the main window shows once after an update, under the update
 * notice. Never in the quick-add window. The newest version is open; older
 * ones are a line each that opens on a click.
 */
export default function WhatsNew({ version, entries, more, onDone }: Props) {
  return (
    <section
      aria-labelledby="whats-new-title"
      className="mx-4 mb-3 rounded-xl border border-neutral-200 bg-white px-4 pb-4 pt-3.5 shadow-sm sm:mx-6 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2
            id="whats-new-title"
            className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100"
          >
            What's new
          </h2>
          <p className="mt-0.5 text-[12.5px] text-neutral-500 dark:text-neutral-400">
            Dash {version}
            {entries.length > 1 && ` · ${entries.length} versions`}
          </p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1 text-[13px] font-medium text-neutral-800 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
        >
          Got it
        </button>
      </div>

      <div className="tidy-scroll mt-3 max-h-[45vh] overflow-y-auto pr-1">
        <ReleaseEntries entries={entries} />
        {more && (
          <p className="mt-2 text-[12px] text-neutral-400 dark:text-neutral-500">
            Earlier versions are in CHANGELOG.md on GitHub.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Versions newest first: on the card, and for every release an update brings
 * before it is installed (notice and Settings). With one version, just its
 * changes (the title around it names it); with several, the newest open and
 * the rest folded to a line each.
 */
export function ReleaseEntries({ entries }: { entries: ChangelogEntry[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(entries.slice(0, 1).map((e) => e.version)));
  if (entries.length === 1) return <ChangeSections sections={entries[0].sections} />;
  return (
    <div className="divide-y divide-neutral-200/80 dark:divide-neutral-800">
      {entries.map((entry) => {
        const isOpen = open.has(entry.version);
        const count = entry.sections.reduce((n, s) => n + s.items.length, 0);
        return (
          <div key={entry.version} className="py-1 first:pt-0 last:pb-0">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() =>
                setOpen((s) => {
                  const next = new Set(s);
                  if (isOpen) next.delete(entry.version);
                  else next.add(entry.version);
                  return next;
                })
              }
              className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800/70"
            >
              <ChevronRight
                className={`shrink-0 text-[13px] text-neutral-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
              <span className="text-[13px] font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                {entry.version}
              </span>
              {entry.date && (
                <span className="text-[12px] text-neutral-400 dark:text-neutral-500">{formatDate(entry.date)}</span>
              )}
              {!isOpen && (
                <span className="ml-auto text-[12px] text-neutral-400 dark:text-neutral-500">
                  {count === 1 ? "1 change" : `${count} changes`}
                </span>
              )}
            </button>
            {isOpen && (
              <div className="pb-2 pl-6 pt-1.5">
                <ChangeSections sections={entry.sections} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const TAGS: Record<string, { label: string; cls: string }> = {
  added: { label: "New", cls: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" },
  changed: { label: "Improved", cls: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300" },
  fixed: { label: "Fixed", cls: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" },
  removed: { label: "Removed", cls: "bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300" },
};
const OTHER = "bg-neutral-500/10 text-neutral-600 dark:bg-white/10 dark:text-neutral-300";

/**
 * One version's changes: a coloured tag per kind ("New", "Improved",
 * "Fixed"…) and its items as a list.
 */
export function ChangeSections({ sections }: { sections: ChangelogSection[] }) {
  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const tag = TAGS[section.heading.toLowerCase()] ?? { label: section.heading, cls: OTHER };
        return (
          <div key={section.heading}>
            <span
              className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold tracking-wide ${tag.cls}`}
            >
              {tag.label}
            </span>
            <ul className="mt-1.5 space-y-1.5">
              {section.items.map((item, i) => (
                <li
                  key={i}
                  className="relative max-w-[70ch] pl-4 text-[13px] leading-relaxed text-neutral-700 before:absolute before:left-1 before:top-[0.6em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-neutral-300 dark:text-neutral-200 dark:before:bg-neutral-600"
                >
                  {inline(item)}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** "2026-11-17" as "17 Nov 2026"; anything else as it is. */
function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** `code` spans as code; the rest as plain text, never as HTML. */
function inline(text: string) {
  return text.split("`").map((part, i) =>
    i % 2 === 1 ? (
      <code
        key={i}
        className="rounded bg-neutral-900/[0.05] px-1 font-mono text-[11.5px] dark:bg-white/10"
      >
        {part}
      </code>
    ) : (
      part
    ),
  );
}
