import Image from "next/image";
import { fileUrl, isPdf } from "@/lib/uploads";

/** Thumbnail (or PDF chip) for an uploaded proof/receipt; opens the full file in a new tab. */
export function ProofLink({ path, size = 64 }: { path: string | null; size?: number }) {
  if (!path) return <span className="text-xs text-muted">No file</span>;
  const url = fileUrl(path);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block shrink-0">
      {isPdf(path) ? (
        <span
          style={{ width: size, height: size }}
          className="flex items-center justify-center rounded-lg border border-line bg-bad-bg text-xs font-bold text-bad"
        >
          PDF
        </span>
      ) : (
        <Image
          src={url}
          alt="Uploaded proof"
          width={size}
          height={size}
          unoptimized // private file behind auth; the image optimizer can't fetch it with the user's cookie
          className="rounded-lg border border-line object-cover"
          style={{ width: size, height: size }}
        />
      )}
    </a>
  );
}
