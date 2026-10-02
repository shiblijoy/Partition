import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Savings Society",
  description: "Monthly deposits, payment proofs, approvals and fund accounts for our savings society.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Society", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 font-sans text-slate-900">{children}</body>
    </html>
  );
}
