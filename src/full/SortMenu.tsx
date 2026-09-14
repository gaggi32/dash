import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronDown, SortIcon } from "../components/icons";
import type { SortKey } from "../lib/types";

/** What this dropdown can select: either a sort order, or the "next week" view. */
export type ViewKey = SortKey | "nextWeek";

const OPTIONS: { key: ViewKey; label: string }[] = [
  { key: "created", label: "Newest" },
  { key: "due", label: "Due date" },
  { key: "nextWeek", label: "Next week" },
];

interface Props {
  value: ViewKey;
  onChange: (value: ViewKey) => void;
}

/**
 * Themed sort dropdown. Replaces the native <select> whose OS-drawn popup
 * renders as a stark white panel that clashes with the app's surfaces.
 */
export default function SortMenu({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = OPTIONS.find((o) => o.key === value) ?? OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="surface inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-neutral-600 transition-colors hover:border-neutral-400/70 hover:text-neutral-900 focus:border-neutral-500 focus:outline-none dark:text-neutral-300 dark:hover:border-neutral-500/50 dark:hover:text-neutral-100"
      >
        <SortIcon className="shrink-0 text-[15px] text-neutral-400" />
        {/* The label is the first thing to go when the window gets tight. */}
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown
          className={[
            "shrink-0 text-[14px] text-neutral-400 transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {open && (
        <div className="pop-in surface absolute right-0 z-30 mt-1.5 min-w-[150px] overflow-hidden rounded-lg p-1 shadow-md">
          {OPTIONS.map((o) => {
            const active = o.key === value;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  onChange(o.key);
                  setOpen(false);
                }}
                className={[
                  "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-[13px] font-medium transition-colors",
                  active
                    ? "accent-soft"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
                ].join(" ")}
              >
                {o.label}
                {active && <CheckIcon className="text-[15px]" strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
