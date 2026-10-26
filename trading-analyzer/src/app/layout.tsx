import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trading Analyzer",
  description: "Technical and news analysis with historically calibrated probabilities, buy/sell suggestions and risk.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-bg font-sans text-ink">{children}</body>
    </html>
  );
}
