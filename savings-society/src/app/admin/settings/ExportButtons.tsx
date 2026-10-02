import { primaryButton, secondaryButton } from "@/components/ui";

export function ExportButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      <a href="/admin/export/xlsx" className={`${primaryButton} no-underline`}>Download Excel</a>
      <a href="/admin/export/files" className={`${secondaryButton} h-12 no-underline`}>Download files (ZIP)</a>
    </div>
  );
}
