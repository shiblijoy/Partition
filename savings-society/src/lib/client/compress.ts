/**
 * NFR-PERF-02: proof photos are shrunk on the phone to under 1 MB before upload
 * (longest side 1600 px, JPEG). PDFs and small images are left as they are.
 */
export async function compressImage(file: File, maxBytes = 1_000_000, maxSide = 1600): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= maxBytes) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.55, 0.4]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
      if (blob && (blob.size <= maxBytes || quality === 0.4)) return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    }
  } catch {
    // an image the browser can't decode: upload it as it is
  }
  return file;
}
