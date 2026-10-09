import type { Metadata } from "next";
import { Suspense } from "react";
import { DocsPortal } from "@/components/docs/DocsPortal";
import "./docs.css";

export const metadata: Metadata = {
  title: "Dokumentasi dan panduan setup Entaris",
  description:
    "Panduan instalasi mandiri Entaris dari awal menggunakan Docker Compose dan dokumentasi fungsi teknis seluruh modul ERP: Akuntansi PSAK, Penjualan, Pembelian, Kas Bank, Produksi BOM WAC, EAM Aset, hingga agen AI AIRA (386 tools MCP).",
  keywords: [
    "dokumentasi entaris",
    "setup erp docker compose",
    "panduan modul erp",
    "akuntansi psak erp",
    "buku besar gl",
    "bom manufaktur",
    "aira agent mcp tools",
    "rekonsiliasi bank otomatis",
    "surat jalan sjs",
  ],
  openGraph: {
    title: "Dokumentasi & Panduan Setup Modul ERP Entaris",
    description:
      "Pelajari cara instalasi mandiri di server sendiri dan telusuri fungsi lengkap tiap modul ERP Entaris beserta alur transaksi dan integrasi AI AIRA.",
    url: "https://entaris.arahkarya.com/docs",
    siteName: "Entaris Documentation",
    locale: "id_ID",
    type: "website",
  },
};

export default function DocsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fcfbfa", color: "#1b2b48", fontFamily: "sans-serif" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 36, height: 36, border: "3px solid #e8e6e1", borderTopColor: "#2f6fc4", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 1rem" }} />
            <p style={{ fontWeight: 600 }}>Memuat Dokumentasi Entaris...</p>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      }
    >
      <DocsPortal />
    </Suspense>
  );
}
