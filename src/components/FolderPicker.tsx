import { useEffect, useRef, useState } from "react";
import { CheckIcon, FolderIcon, InboxIcon } from "./icons";
import type { Folder } from "../lib/types";

interface SelectProps {
  folders: Folder[];
  /** `undefined` shows the list with nothing highlighted — for pickers with no single current value. */
  value: number | null | undefined;
  onChange: (id: number | null) => void;
}

/**
 * The bare list of folders, without any positioning of its own.
 *
 * Rendered inline where a popover would be clipped — inside a scrolling task
 * list, or inside the fixed-size quick-add window — and wrapped in a popover by
 * `FolderPicker` where there's room.
 */
export function FolderSelect({ folders, value, onChange }: SelectProps) {
  return (
    <div className="surface tidy-scroll max-h-[200px] overflow-y-auto rounded-xl p-1 shadow-md">
      <Option
        icon={<InboxIcon />}
        label="No folder"
        active={value === null}
        onClick={() => onChange(null)}
      />
      {folders.map((f) => (
        <Option
          key={f.id}
          icon={<FolderIcon />}
          label={f.name}
          active={value === f.id}
          onClick={() => onChange(f.id)}
        />
      ))}
      {folders.length === 0 && (
        <p className="px-3 py-2 text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">
          No folders yet — add one from the sidebar.
        </p>
      )}
    </div>
  );
}

function Option({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
        active
          ? "accent-soft"
          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
      ].join(" ")}
    >
      <span className="shrink-0 text-[15px] text-neutral-400">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active && <CheckIcon className="shrink-0 text-[15px]" strokeWidth={2.5} />}
    </button>
  );
}

/** Label for a folder chip: the folder's name, or a neutral placeholder. */
export function folderLabel(folders: Folder[], value: number | null | undefined): string {
  if (value == null) return "No folder";
  return folders.find((f) => f.id === value)?.name ?? "No folder";
}

interface PickerProps extends SelectProps {
  /** Which edge the popover hangs from. */
  align?: "left" | "right";
}

/** Chip + popover, for places with room to overlay — the inline composer. */
export default function FolderPicker({
  folders,
  value,
  onChange,
  align = "right",
}: PickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        className={[
          "inline-flex max-w-[140px] shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
          value !== null
            ? "accent-soft"
            : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
        ].join(" ")}
      >
        <FolderIcon className="shrink-0 text-[15px]" />
        <span className="hidden truncate md:inline">
          {folderLabel(folders, value)}
        </span>
      </button>

      {open && (
        <div
          className={[
            "pop-in absolute z-20 mt-2 w-[200px]",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          <FolderSelect
            folders={folders}
            value={value}
            onChange={(id) => {
              onChange(id);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
