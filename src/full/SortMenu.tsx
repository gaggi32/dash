import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronDown, SortIcon } from "../components/icons";
import type { SortKey } from "../lib/types";

const OPTIONS: { key: SortKey; label: string }[] = [
  { key: "created", label: "Newest" },
  { key: "due", label: "Due date" },
];

interface Props {
  value: SortKey;
  onChange: (value: SortKey) => void;
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
        className="inline-flex items-center gap-1.5 rounded-lg border border-black/5 bg-white/70 px-2.5 py-1.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-white/5 dark:text-neutral-200 dark:hover:bg-white/10"
      >
        <SortIcon className="text-[15px] text-neutral-400" />
        {current.label}
        <ChevronDown
          className={[
            "text-[14px] text-neutral-400 transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {open && (
        <div className="pop-in absolute right-0 z-30 mt-1.5 min-w-[150px] overflow-hidden rounded-xl border border-black/5 bg-white/90 p-1 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-800/95 dark:ring-white/5">
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
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors",
                  active
                    ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                    : "text-neutral-600 hover:bg-black/5 dark:text-neutral-200 dark:hover:bg-white/10",
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
