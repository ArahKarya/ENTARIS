import type { Metadata, Viewport } from "next";
import "./site.css";
import "./site-root.css";
import "./entaris-theme.css";
import "./site-chrome.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://entaris.arahkarya.com"),
  title: {
    default: "Entaris — Agentic Reasoning System",
    template: "%s | Entaris",
  },
  description:
    "ERP untuk penjualan, pembelian, inventori, produksi & keuangan dalam satu sistem — pembukuan double-entry otomatis dan agen AI AIRA yang bernalar di atas data Anda. Self-hosted.",
  icons: {
    icon: [{ url: "/brand/entaris-icon.svg", type: "image/svg+xml" }],
    apple: "/brand/entaris-icon-maskable.svg",
  },
};

export const viewport: Viewport = { themeColor: "#1B2B48" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
