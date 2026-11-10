"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { useT } from "@/components/I18n";
import { primaryButton, secondaryButton } from "@/components/ui";

/** FR-RCP-04: download the server-made PDF; Share uses the phone's share sheet (the PDF itself where the phone allows). */
export function ReceiptActions({ title, receiptNo }: { title: string; receiptNo: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const pdfUrl = `/receipts/${encodeURIComponent(receiptNo)}/pdf`;
  return (
    <div className="no-print grid grid-cols-2 gap-2.5">
      <a href={pdfUrl} target="_blank" rel="noopener" className={`h-13 ${primaryButton} no-underline`}>
        <Icon name="download" size={18} />
        {t("Download PDF")}
      </a>
      <button
        type="button"
        onClick={async () => {
          try {
            const blob = await (await fetch(pdfUrl)).blob();
            const file = new File([blob], `${receiptNo}.pdf`, { type: "application/pdf" });
            if (navigator.canShare?.({ files: [file] })) return await navigator.share({ title, files: [file] });
            if (navigator.share) return await navigator.share({ title, url: window.location.href });
          } catch {
            return; // closed the share sheet
          }
          await navigator.clipboard?.writeText(window.location.href).catch(() => {});
          setCopied(true);
        }}
        className={`h-13 ${secondaryButton}`}
      >
        <Icon name="share" size={18} />
        {copied ? t("Link copied") : t("Share")}
      </button>
    </div>
  );
}
