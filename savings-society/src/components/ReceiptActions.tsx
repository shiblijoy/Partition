"use client";

import { Icon } from "@/components/icons";
import { primaryButton, secondaryButton } from "@/components/ui";

/** "Download PDF" uses the browser's print-to-PDF; "Share" uses the phone's share sheet when there is one. */
export function ReceiptActions({ title }: { title: string }) {
  return (
    <div className="no-print grid grid-cols-2 gap-2.5">
      <button type="button" onClick={() => window.print()} className={`h-13 ${primaryButton}`}>
        <Icon name="download" size={18} />
        Download PDF
      </button>
      <button
        type="button"
        onClick={async () => {
          const data = { title, url: window.location.href };
          if (navigator.share) {
            try {
              await navigator.share(data);
            } catch {
              // closed the share sheet
            }
          } else {
            await navigator.clipboard.writeText(data.url);
            alert("Link copied.");
          }
        }}
        className={`h-13 ${secondaryButton}`}
      >
        <Icon name="share" size={18} />
        Share
      </button>
    </div>
  );
}
