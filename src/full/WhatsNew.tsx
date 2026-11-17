import type { ChangelogEntry, ChangelogSection } from "../lib/changelog";

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
 * notice and styled like it. Never in the quick-add window.
 */
export default function WhatsNew({ version, entries, more, onDone }: Props) {
  // One version needs no sub-heading; the title already names it.
  const several = entries.length > 1;

  return (
    <section
      aria-labelledby="whats-new-title"
      className="mx-4 mb-3 rounded-lg border border-neutral-200 bg-white/70 px-3 py-2 text-[13px] sm:mx-6 dark:border-neutral-800 dark:bg-neutral-900/60"
    >
      <div className="flex items-center gap-3">
        <h2
          id="whats-new-title"
          className="min-w-0 flex-1 truncate font-medium text-neutral-900 dark:text-neutral-100"
        >
          What's new in {version}
        </h2>
        <button
          type="button"
          onClick={onDone}
          className="shrink-0 font-medium text-neutral-900 underline-offset-2 hover:underline dark:text-neutral-100"
        >
          Got it
        </button>
      </div>

      <div className="tidy-scroll mt-1.5 max-h-40 space-y-2 overflow-y-auto pr-1">
        {entries.map((entry) => (
          <div key={entry.version}>
            {several && (
              <p className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">
                {entry.version}
                {entry.date && (
                  <span className="font-normal text-neutral-400 dark:text-neutral-500">
                    {" "}
                    · {entry.date}
                  </span>
                )}
              </p>
            )}
            <ChangeSections sections={entry.sections} />
          </div>
        ))}
        {more && (
          <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
            …and earlier changes.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * One version's "Added / Changed / …" headings and their items: on the card,
 * and for an update's notes before it is installed (notice and Settings).
 */
export function ChangeSections({ sections }: { sections: ChangelogSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.heading} className="mt-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {section.heading}
          </p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[12.5px] leading-snug text-neutral-600 marker:text-neutral-300 dark:text-neutral-300 dark:marker:text-neutral-600">
            {section.items.map((item, i) => (
              <li key={i}>{inline(item)}</li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
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
