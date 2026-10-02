import { readdir, readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { routeAdmin } from "@/lib/admin-route";
import { audit } from "@/lib/audit";
import { STORAGE_ROOT } from "@/lib/uploads";

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // nothing uploaded yet
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** Every uploaded file (proofs, receipts, documents, statements) as one ZIP, keeping its folder structure. */
export async function GET() {
  const admin = await routeAdmin();
  if (!admin) return new Response("Forbidden", { status: 403 });

  const zip = new JSZip();
  for await (const file of walk(STORAGE_ROOT)) {
    zip.file(path.relative(STORAGE_ROOT, file), await readFile(file));
  }
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  await audit(admin.id, "data.exported", `${admin.name} downloaded all uploaded files (ZIP)`);
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="dreamhive-files-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  });
}
