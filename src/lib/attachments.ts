import { invoke } from "@tauri-apps/api/core";
import type { Attachment } from "./types";

/** Files are copied into app storage, so cap what one attachment can cost. */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

/** Tolerant parse of the `attachments` JSON column; anything malformed becomes "none". */
export function parseAttachments(raw: string | null | undefined): Attachment[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (a): a is Attachment =>
        !!a && typeof a.id === "string" && typeof a.name === "string",
    ).map((a) => ({ id: a.id, name: a.name, size: Number(a.size) || 0 }));
  } catch {
    return [];
  }
}

/** Copies one file into app storage. */
async function storeFile(file: File): Promise<Attachment> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // The name travels in a header, which must be ASCII.
  const [id, name, size] = await invoke<[string, string, number]>(
    "save_attachment",
    bytes,
    { headers: { "x-name": encodeURIComponent(file.name || "file") } },
  );
  return { id, name, size };
}

export interface StoreResult {
  added: Attachment[];
  /** Human-readable reasons, one per file that couldn't be stored. */
  errors: string[];
}

export async function storeFiles(files: File[]): Promise<StoreResult> {
  const added: Attachment[] = [];
  const errors: string[] = [];
  for (const f of files) {
    if (f.size > MAX_ATTACHMENT_BYTES) {
      errors.push(`${f.name} is larger than ${formatSize(MAX_ATTACHMENT_BYTES)}`);
      continue;
    }
    try {
      added.push(await storeFile(f));
    } catch (err) {
      console.error("Failed to attach file:", err);
      errors.push(`Couldn't attach ${f.name || "file"}`);
    }
  }
  return { added, errors };
}

export function openAttachment(a: Attachment): Promise<void> {
  return invoke<void>("open_attachment", { id: a.id, name: a.name });
}

/** Deletes the stored files. Best effort: a leftover file is harmless, a thrown error mid-delete isn't. */
export async function discardAttachments(list: Attachment[]): Promise<void> {
  await Promise.all(
    list.map((a) =>
      invoke<void>("delete_attachment", { id: a.id }).catch((err) =>
        console.warn("Failed to delete attachment:", err),
      ),
    ),
  );
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
