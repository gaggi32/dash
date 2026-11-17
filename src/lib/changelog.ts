/**
 * CHANGELOG.md read as data, for the "What's new" card after an update, and
 * a release's notes, for what an update about to be installed brings.
 *
 * The release job turns the same file into the GitHub release notes, so the
 * card and the release page say the same thing. Pure functions only: the
 * bundled copy is parsed in releases.ts.
 */

export interface ChangelogSection {
  /** "Added", "Changed", "Fixed" or "Removed". */
  heading: string;
  items: string[];
}

export interface ChangelogEntry {
  /** "x.y.z". */
  version: string;
  /** "YYYY-MM-DD" as written, or "" when the heading has none. */
  date: string;
  sections: ChangelogSection[];
}

/** One release an update brings, as `check_update` returns it in `missed`. */
export interface MissedRelease {
  /** "x.y.z". */
  version: string;
  /** Its GitHub release body (read with {@link parseReleaseNotes}), or null. */
  notes: string | null;
}

/** At most this many versions on the card; older ones become one line. */
export const WHATS_NEW_CAP = 3;

const VERSION_HEAD = /^##\s+\[v?(\d+\.\d+\.\d+)\](?:\s*[—–-]\s*(\S+))?\s*$/;
const SECTION_HEAD = /^###\s+(.+?)\s*$/;
const ITEM = /^[-*]\s+(.+)$/;

/**
 * Adds one line of a version's body to its sections: a `### ` heading starts
 * a section, a `- ` item joins the last one, and an indented line carries on
 * the item above it. Anything else (and items before any heading) is skipped.
 */
function addLine(sections: ChangelogSection[], line: string): void {
  const head = SECTION_HEAD.exec(line);
  if (head) {
    sections.push({ heading: head[1], items: [] });
    return;
  }
  const section = sections[sections.length - 1];
  if (!section) return;
  const item = ITEM.exec(line);
  if (item) {
    section.items.push(item[1].trim());
  } else if (/^\s+\S/.test(line) && section.items.length > 0) {
    section.items[section.items.length - 1] += ` ${line.trim()}`;
  }
}

const filled = (sections: ChangelogSection[]) => sections.filter((s) => s.items.length > 0);

/**
 * Every version in the file, in file order (newest first). `## [Unreleased]`
 * and anything above the first version are skipped, and so are headings with
 * nothing under them. An indented line carries on the item above it.
 */
export function parseChangelog(text: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let entry: ChangelogEntry | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) {
      const m = VERSION_HEAD.exec(line);
      entry = m ? { version: m[1], date: m[2] ?? "", sections: [] } : null;
      if (entry) entries.push(entry);
      continue;
    }
    if (entry) addLine(entry.sections, line);
  }

  for (const e of entries) e.sections = filled(e.sections);
  return entries;
}

/**
 * The sections of a release's notes, as GitHub has them: the release job
 * writes the version's CHANGELOG.md section without its `## [x.y.z]` line, so
 * the same rules apply. Empty when the notes are missing or have no
 * `### ` sections with items.
 */
export function parseReleaseNotes(notes: string | null | undefined): ChangelogSection[] {
  if (!notes) return [];
  const sections: ChangelogSection[] = [];
  for (const raw of notes.split(/\r?\n/)) {
    const line = raw.trimEnd();
    // A version heading would belong to another entry: stop at the first one
    // after any sections (notes written by hand might repeat their own).
    if (line.startsWith("## ")) {
      if (sections.length > 0) break;
      continue;
    }
    addLine(sections, line);
  }
  return filled(sections);
}

/**
 * The releases an update brings, as entries laid out like the card's: each
 * version with its parsed notes, newest first. Anything not shaped like
 * `check_update`'s `missed`, a version that is not x.y.z, a repeat, or notes
 * with no sections are left out.
 */
export function missedEntries(missed: unknown): ChangelogEntry[] {
  if (!Array.isArray(missed)) return [];
  const seen = new Set<string>();
  const entries: ChangelogEntry[] = [];
  for (const m of missed) {
    if (typeof m !== "object" || m === null) continue;
    const { version, notes } = m as Record<string, unknown>;
    if (typeof version !== "string" || !parts(version) || seen.has(version)) continue;
    const sections = parseReleaseNotes(typeof notes === "string" ? notes : null);
    if (sections.length === 0) continue;
    seen.add(version);
    entries.push({ version, date: "", sections });
  }
  return entries.sort((a, b) => compareVersions(b.version, a.version) ?? 0);
}

function parts(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Below, at or above zero as `a` is older than, the same as or newer than `b`,
 * comparing x.y.z as numbers (0.10.0 is newer than 0.9.0). Null when either is
 * not a version.
 */
export function compareVersions(a: string, b: string): number | null {
  const pa = parts(a);
  const pb = parts(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** The entries newer than `after` and up to `upTo`, newest first. */
export function entriesBetween(
  entries: ChangelogEntry[],
  after: string,
  upTo: string,
): ChangelogEntry[] {
  return entries
    .filter((e) => {
      const newer = compareVersions(e.version, after);
      const notAhead = compareVersions(e.version, upTo);
      return newer !== null && newer > 0 && notAhead !== null && notAhead <= 0;
    })
    .sort((a, b) => compareVersions(b.version, a.version) ?? 0);
}

/**
 * What the main window does at launch:
 * - `remember`: save the running version and show nothing. A fresh install,
 *   or an update from a version before the card, has no last-seen version,
 *   and is not greeted with history.
 * - `show`: the card, with the newest {@link WHATS_NEW_CAP} versions since the
 *   one last seen; `more` when there were older ones too. "Got it" saves the
 *   running version.
 * - `nothing`: already seen (or a downgrade).
 */
export type WhatsNewPlan =
  | { kind: "nothing" }
  | { kind: "remember" }
  | { kind: "show"; entries: ChangelogEntry[]; more: boolean };

export function planWhatsNew(
  entries: ChangelogEntry[],
  lastSeen: string,
  running: string,
  cap = WHATS_NEW_CAP,
): WhatsNewPlan {
  if (!parts(running)) return { kind: "nothing" };
  const order = compareVersions(lastSeen, running);
  if (order === null) return { kind: "remember" };
  if (order >= 0) return { kind: "nothing" };
  const picked = entriesBetween(entries, lastSeen, running);
  // Newer, but nothing written down for it (a build between releases).
  if (picked.length === 0) return { kind: "remember" };
  return { kind: "show", entries: picked.slice(0, cap), more: picked.length > cap };
}
