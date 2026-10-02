import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

/**
 * Payment proofs are personal financial documents, so they're stored outside
 * /public and only served through the authenticated /files route.
 */
export const STORAGE_ROOT = path.join(process.cwd(), "storage");
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — a full-resolution phone photo fits
export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const CONTENT_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_TYPES).map(([type, ext]) => [ext, type])
);

export class UploadError extends Error {}

/** Saves an upload under storage/<folder>/ and returns its relative path, e.g. "proofs/<userId>/<uuid>.jpg". */
export async function saveFile(folder: string, file: File, maxBytes = MAX_FILE_BYTES): Promise<string> {
  if (!(file instanceof File) || file.size === 0) {
    throw new UploadError("No file provided.");
  }
  if (file.size > maxBytes) {
    throw new UploadError(`"${file.name}" is larger than ${Math.round(maxBytes / 1024 / 1024)}MB.`);
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    throw new UploadError(`"${file.name}" isn't supported — upload a JPEG, PNG, WebP photo or a PDF.`);
  }

  const dir = path.join(STORAGE_ROOT, folder);
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return `${folder}/${filename}`;
}

/** Resolves a stored relative path to an absolute one, refusing anything that escapes the storage root. */
function resolveStored(relPath: string): string | null {
  const abs = path.resolve(STORAGE_ROOT, relPath);
  return abs.startsWith(STORAGE_ROOT + path.sep) ? abs : null;
}

export async function readStoredFile(relPath: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const abs = resolveStored(relPath);
  if (!abs) return null;
  try {
    const bytes = await readFile(abs);
    const ext = path.extname(abs).slice(1).toLowerCase();
    return { bytes, contentType: CONTENT_TYPES[ext] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

/** Deletes a stored file. Safe to call even if it's already gone. */
export async function deleteStoredFile(relPath: string | null): Promise<void> {
  if (!relPath) return;
  const abs = resolveStored(relPath);
  if (!abs) return;
  try {
    await unlink(abs);
  } catch {
    // already gone — nothing to do
  }
}

export function fileUrl(relPath: string): string {
  return `/files/${relPath}`;
}

export function isPdf(relPath: string): boolean {
  return relPath.toLowerCase().endsWith(".pdf");
}
