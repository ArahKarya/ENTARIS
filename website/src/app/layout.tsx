import type { Metadata, Viewport } from "next";
import "./site.css";
import "./site-root.css";
import "./entaris-theme.css";
import "./site-chrome.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://entaris.arahkarya.com"),
  title: {
    default: "Entaris — ERP dengan kemampuan reasoning",
    template: "%s | Entaris",
  },
  description:
    "Entaris adalah ERP yang bisa bernalar: penjualan, pembelian, inventori, produksi & keuangan dalam satu buku besar, dengan agen AI AIRA yang menjawab, menganalisis, dan menyiapkan draf. Fleksibel, mudah diakses, sesuai standar akuntansi, dan siap tumbuh.",
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
