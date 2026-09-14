import { useEffect, useRef, useState } from "react";
import {
  FolderIcon,
  InboxIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import type { Folder, FolderCounts, FolderScope } from "../lib/types";

interface Props {
  folders: Folder[];
  counts: FolderCounts;
  scope: FolderScope;
  onSelect: (scope: FolderScope) => void;
  onCreate: (name: string) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  /** Narrow windows show the rail as an overlay drawer; this is its open state. */
  open: boolean;
  onClose: () => void;
}

/**
 * The left rail: "All tasks", one row per folder, then "Unfiled". Selecting a
 * row scopes the list on the right; folders are renamed in place and deleting
 * one only unfiles its tasks, it never deletes them.
 */
export default function FolderList({
  folders,
  counts,
  scope,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  open,
  onClose,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const newRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) newRef.current?.focus();
  }, [creating]);

  /** Picking a folder also dismisses the drawer, which covers the list. */
  const select = (next: FolderScope) => {
    onSelect(next);
    onClose();
  };

  const submitNew = () => {
    const name = draft.trim();
    if (name) onCreate(name);
    setDraft("");
    setCreating(false);
  };

  const submitRename = (id: number) => {
    const name = editDraft.trim();
    if (name) onRename(id, name);
    setEditingId(null);
  };

  return (
    <aside
      className={[
        "flex w-48 shrink-0 flex-col border-r border-neutral-200/80 pb-4 dark:border-neutral-800/80",
        // Under `sm` the window is too narrow to spare 12rem permanently, so
        // the rail lifts out of the flex row and slides in over the list.
        "max-sm:absolute max-sm:inset-y-0 max-sm:left-0 max-sm:z-40 max-sm:w-56",
        "max-sm:bg-neutral-50 max-sm:shadow-xl max-sm:transition-transform max-sm:duration-200",
        "max-sm:dark:bg-neutral-950",
        open ? "max-sm:translate-x-0" : "max-sm:-translate-x-full",
      ].join(" ")}
    >
      <nav className="tidy-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        <Row
          icon={<LayersIcon />}
          label="All tasks"
          count={counts.all}
          active={scope === "all"}
          onClick={() => select("all")}
        />

        {folders.map((f) =>
          deletingId === f.id ? (
            <DeleteConfirm
              key={f.id}
              name={f.name}
              onCancel={() => setDeletingId(null)}
              onConfirm={() => {
                onDelete(f.id);
                setDeletingId(null);
              }}
            />
          ) : editingId === f.id ? (
            <input
              key={f.id}
              autoFocus
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onBlur={() => submitRename(f.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename(f.id);
                if (e.key === "Escape") setEditingId(null);
              }}
              className="w-full rounded-md border border-neutral-400 bg-white px-2 py-1.5 text-[13px] outline-none dark:border-neutral-500 dark:bg-neutral-800"
            />
          ) : (
            <Row
              key={f.id}
              icon={<FolderIcon />}
              label={f.name}
              count={counts.byFolder[f.id] ?? 0}
              active={scope === f.id}
              onClick={() => select(f.id)}
              actions={
                <>
                  <IconButton
                    label={`Rename ${f.name}`}
                    onClick={() => {
                      setEditDraft(f.name);
                      setEditingId(f.id);
                    }}
                  >
                    <PencilIcon />
                  </IconButton>
                  <IconButton
                    label={`Delete ${f.name}`}
                    danger
                    onClick={() => setDeletingId(f.id)}
                  >
                    <TrashIcon />
                  </IconButton>
                </>
              }
            />
          ),
        )}

        <Row
          icon={<InboxIcon />}
          label="Unfiled"
          count={counts.unfiled}
          active={scope === "unfiled"}
          onClick={() => select("unfiled")}
        />

        {creating && (
          <input
            ref={newRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitNew}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNew();
              if (e.key === "Escape") {
                setDraft("");
                setCreating(false);
              }
            }}
            placeholder="Folder name"
            className="w-full rounded-md border border-neutral-400 bg-white px-2 py-1.5 text-[13px] outline-none placeholder:text-neutral-400 dark:border-neutral-500 dark:bg-neutral-800"
          />
        )}
      </nav>

      <div className="px-2">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <PlusIcon className="text-[15px]" />
          New folder
        </button>
      </div>
    </aside>
  );
}

function Row({
  icon,
  label,
  count,
  active,
  onClick,
  actions,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className={[
          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
          active
            ? "accent-soft"
            : "text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800",
        ].join(" ")}
      >
        <span className="shrink-0 text-[15px] text-neutral-400">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {/* The count gives way to the hover actions so the row never reflows. */}
        <span
          className={[
            "shrink-0 text-[11px] tabular-nums text-neutral-400",
            actions ? "group-hover:invisible" : "",
          ].join(" ")}
        >
          {count > 0 ? count : ""}
        </span>
      </button>

      {actions && (
        <div className="absolute inset-y-0 right-1.5 hidden items-center gap-0.5 group-hover:flex">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * Replaces the folder row in place (same slot as the rename input) so the
 * confirmation can't be missed and never depends on hover state to stay
 * visible while the pointer moves toward its buttons.
 */
function DeleteConfirm({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="rounded-md bg-red-500/5 px-2.5 py-2 ring-1 ring-red-500/20 dark:bg-red-500/10">
      <p className="text-[12px] font-medium leading-snug text-neutral-700 dark:text-neutral-200">
        Delete "{name}"? Its tasks will be unfiled.
      </p>
      <div className="mt-2 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-red-600 px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-red-700"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={[
        "rounded p-1 text-[13px] text-neutral-400 transition-colors",
        danger
          ? "hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
          : "hover:bg-neutral-300/60 hover:text-neutral-900 dark:hover:bg-neutral-700 dark:hover:text-neutral-100",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
