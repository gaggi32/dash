import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PaperclipIcon, XIcon } from "./icons";
import {
  discardAttachments,
  formatSize,
  openAttachment,
  storeFiles,
} from "../lib/attachments";
import type { Attachment } from "../lib/types";

/** Pending attachments for a task that doesn't exist yet (the composers). */
export function useAttachmentDraft() {
  const [items, setItems] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef<Attachment[]>([]);

  const set = (next: Attachment[]) => {
    itemsRef.current = next;
    setItems(next);
  };

  const add = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    const { added, errors } = await storeFiles(files);
    set([...itemsRef.current, ...added]);
    if (errors.length) setError(errors.join(" · "));
    setBusy(false);
  }, []);

  const remove = useCallback((a: Attachment) => {
    set(itemsRef.current.filter((x) => x.id !== a.id));
    void discardAttachments([a]);
  }, []);

  /** Empties the draft; `discard` also deletes the files (false once they belong to a saved task). */
  const reset = useCallback((discard: boolean) => {
    if (discard) void discardAttachments(itemsRef.current);
    set([]);
    setError(null);
  }, []);

  return { items, busy, error, add, remove, reset };
}

/** Drop and paste handlers that feed files to `onFiles`; spread onto a container. */
export function fileIntakeProps(onFiles: (files: File[]) => void) {
  return {
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      e.preventDefault();
      onFiles(files);
    },
    onPaste: (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files);
      if (files.length === 0) return;
      e.preventDefault();
      onFiles(files);
    },
  };
}

interface BarProps {
  items: Attachment[];
  busy?: boolean;
  error?: string | null;
  onFiles: (files: File[]) => void;
  onRemove: (a: Attachment) => void;
  /** Keep the quick window open while the native file picker has focus. */
  holdQuick?: boolean;
  className?: string;
}

/** Attach button plus one chip per file. Chips open the file; the x removes it. */
export function AttachmentBar({
  items,
  busy,
  error,
  onFiles,
  onRemove,
  holdQuick,
  className = "",
}: BarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const release = useCallback(() => {
    if (holdQuick) void invoke("hold_quick", { hold: false });
  }, [holdQuick]);

  // React has no onCancel for <input>; dismissing the picker fires it natively.
  useEffect(() => {
    const el = inputRef.current;
    el?.addEventListener("cancel", release);
    return () => el?.removeEventListener("cancel", release);
  }, [release]);

  const pick = async () => {
    if (holdQuick) await invoke("hold_quick", { hold: true });
    inputRef.current?.click();
  };

  const message = error ?? openError;

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            release();
            onFiles(files);
          }}
        />
        <button
          type="button"
          onClick={() => void pick()}
          title="Attach files (or drop / paste them)"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-neutral-500 transition-colors hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
        >
          <PaperclipIcon className="text-[14px]" />
          {busy ? "Attaching…" : "Attach"}
        </button>

        <div className="tidy-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {items.map((a) => (
            <span
              key={a.id}
              className="inline-flex shrink-0 items-center rounded-lg bg-neutral-900/[0.06] text-[12px] font-medium text-neutral-700 dark:bg-white/10 dark:text-neutral-200"
            >
              <button
                type="button"
                onClick={() => {
                  setOpenError(null);
                  openAttachment(a).catch((err) => setOpenError(String(err)));
                }}
                title={`Open ${a.name}`}
                className="inline-flex max-w-[170px] items-center gap-1.5 rounded-l-lg py-1 pl-2 pr-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              >
                <PaperclipIcon className="shrink-0 text-[12px] text-neutral-400" />
                <span className="truncate">{a.name}</span>
                <span className="shrink-0 text-[11px] font-normal text-neutral-400">
                  {formatSize(a.size)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(a)}
                title="Remove"
                className="rounded-r-lg px-1.5 py-1 text-[12px] text-neutral-400 transition-colors hover:bg-black/5 hover:text-neutral-900 dark:hover:bg-white/10 dark:hover:text-neutral-100"
              >
                <XIcon />
              </button>
            </span>
          ))}
        </div>
      </div>
      {message && (
        <p className="mt-1 px-1 text-[11px] font-medium text-red-600 dark:text-red-400">
          {message}
        </p>
      )}
    </div>
  );
}
