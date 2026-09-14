import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads", "animals");
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB per photo
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export class UploadError extends Error {}

/** Saves an uploaded photo for an animal to disk and returns its public URL (e.g. /uploads/animals/<id>/<file>). */
export async function saveAnimalPhoto(animalId: string, file: File): Promise<string> {
  if (!(file instanceof File) || file.size === 0) {
    throw new UploadError("No file provided.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new UploadError(`"${file.name}" is larger than 8MB.`);
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    throw new UploadError(`"${file.name}" isn't a supported image type (use JPEG, PNG, WebP, or GIF).`);
  }

  const dir = path.join(UPLOAD_ROOT, animalId);
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), bytes);

  return `/uploads/animals/${animalId}/${filename}`;
}

/** Deletes a previously saved photo from disk, given its public URL. Safe to call even if the file is already gone. */
export async function deleteAnimalPhotoFile(url: string): Promise<void> {
  if (!url.startsWith("/uploads/animals/")) return; // guard against deleting anything outside the upload dir
  const filePath = path.join(process.cwd(), "public", url);
  try {
    await unlink(filePath);
  } catch {
    // already gone — nothing to do
  }
}
