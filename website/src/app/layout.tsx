import type { Metadata, Viewport } from "next";
import "./site.css";
import "./site-root.css";
import "./entaris-theme.css";
import "./site-chrome.css";

// Selaras dengan basePath di next.config.ts (kosong bila diserve di root domain).
const BASE = process.env.NEXT_BASE_PATH || "";

export const metadata: Metadata = {
  metadataBase: new URL("https://entaris.arahkarya.com"),
  title: {
    default: "Entaris: ERP yang ikut bertumbuh dengan bisnis Anda",
    template: "%s | Entaris",
  },
  description:
    "Entaris (Enterprise Agentic Reasoning Integrated System) adalah ERP modern dengan agen AI AIRA: penjualan, pembelian, inventori multi-gudang, BOM manufaktur, pengajuan pembayaran, dan draf buku kas dari foto nota, dengan keamanan draf dan gerbang persetujuan manusia.",
  icons: {
    icon: [
      { url: `${BASE}/brand/entaris-icon.svg`, type: "image/svg+xml" },
      { url: `${BASE}/brand/favicon-32.png`, type: "image/png", sizes: "32x32" },
      { url: `${BASE}/brand/favicon-16.png`, type: "image/png", sizes: "16x16" },
      { url: `${BASE}/brand/favicon.ico`, sizes: "48x48" },
    ],
    apple: [{ url: `${BASE}/brand/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "Entaris",
    locale: "id_ID",
    title: "Entaris: ERP yang ikut bertumbuh dengan bisnis Anda",
    description:
      "ERP modern dengan agen AI AIRA: penjualan, pembelian, inventori, produksi, dan keuangan dengan pembukuan double-entry otomatis.",
    images: [{ url: `${BASE}/brand/og-image-1200x630.png`, width: 1200, height: 630, alt: "Entaris, Agentic Reasoning System" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Entaris: ERP yang ikut bertumbuh dengan bisnis Anda",
    images: [`${BASE}/brand/og-image-1200x630.png`],
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
