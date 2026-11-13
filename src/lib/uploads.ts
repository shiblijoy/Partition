import { put, del } from "@vercel/blob";
import { randomUUID } from "crypto";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB per photo
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export class UploadError extends Error {}

/** Uploads a photo for an animal to Vercel Blob storage and returns its public URL. */
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

  const pathname = `animals/${animalId}/${randomUUID()}.${ext}`;
  const blob = await put(pathname, file, {
    access: "public",
    contentType: file.type,
  });

  return blob.url;
}

/** Deletes a previously uploaded photo from Blob storage. Safe to call even if it's already gone. */
export async function deleteAnimalPhotoFile(url: string): Promise<void> {
  try {
    await del(url);
  } catch {
    // already gone — nothing to do
  }
}
