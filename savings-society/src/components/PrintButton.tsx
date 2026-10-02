"use client";

import { Icon } from "@/components/icons";
import { primaryButton } from "@/components/ui";

/** Saves the page as a PDF through the browser's print dialog (navigation and buttons are hidden when printing). */
export function PrintButton({ label = "Download PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={primaryButton}>
      <Icon name="download" size={18} />
      {label}
    </button>
  );
}
