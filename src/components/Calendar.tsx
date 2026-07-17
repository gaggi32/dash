import { useState } from "react";
import { parseISODate, sameDay, toISODate } from "../lib/date";
import { ChevronLeft, ChevronRight } from "./icons";

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * A compact, dependency-free month calendar. Lives entirely inside the parent
 * window (no native OS popup), so it never steals focus away from the borderless
 * quick-add window and won't trigger its hide-on-blur behaviour.
 */
export default function Calendar({ value, onChange }: Props) {
  const selected = value ? parseISODate(value) : null;
  const [cursor, setCursor] = useState<Date>(() => {
    const base = selected ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const today = new Date();
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const shift = (delta: number) => setCursor(new Date(year, month + delta, 1));

  return (
    <div className="surface select-none rounded-xl p-3 text-sm shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[16px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          aria-label="Previous month"
        >
          <ChevronLeft />
        </button>
        <span className="text-[13px] font-semibold tracking-tight">
          {MONTHS[month]} {year}
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[16px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          aria-label="Next month"
        >
          <ChevronRight />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-neutral-400">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const isSelected = selected && sameDay(date, selected);
          const isToday = sameDay(date, today);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(toISODate(date))}
              className={[
                "mx-auto flex h-8 w-8 items-center justify-center rounded-md text-[13px] transition-colors",
                isSelected
                  ? "accent font-medium"
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                !isSelected && isToday
                  ? "font-semibold text-blue-600 ring-1 ring-inset ring-blue-300 dark:text-blue-400 dark:ring-blue-500/40"
                  : "",
              ].join(" ")}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 text-xs dark:border-neutral-800">
        <button
          type="button"
          onClick={() => onChange(toISODate(new Date()))}
          className="rounded-md px-2.5 py-1 font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-md px-2.5 py-1 font-medium text-neutral-500 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
