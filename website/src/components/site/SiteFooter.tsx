"use client";

import Link from "next/link";
import { useErpRoot } from "@/components/erp/shared/ErpRoot";
import { EntarisLogo } from "./EntarisLogo";
import { COMPANY, CONTACT_EMAIL, DEMO_HREF, NAV_ITEMS, WHATSAPP_DISPLAY, WHATSAPP_NUMBER } from "./siteConfig";

const MODULE_LINKS = [
  { href: "/#modul-penjualan", label: "Penjualan" },
  { href: "/#modul-pembelian", label: "Pembelian" },
  { href: "/#modul-inventori", label: "Inventori" },
  { href: "/#modul-produksi", label: "Produksi" },
  { href: "/#modul-keuangan", label: "Keuangan" },
  { href: "/#modul-aset", label: "Aset (EAM)" },
] as const;

export function SiteFooter() {
  const { theme, setTheme } = useErpRoot();
  const year = new Date().getFullYear();

  return (
    <footer className="ent-footer">
      <div className="ent-footer__inner">
        <div className="ent-footer__top">
          <div className="ent-footer__brand">
            <EntarisLogo negative />
            <p className="ent-footer__tagline">Enterprise Agentic Reasoning Integrated System</p>
            <p className="ent-footer__summary">
              Sistem yang ikut bertumbuh dengan bisnis kamu. Dibangun dengan pembukuan otomatis sebagai fondasi dan agen AI AIRA yang ikut bekerja di atas data transaksi Anda. Berjalan di server Anda sendiri — data 100% milik Anda.
            </p>
            <Link className="ent-btn ent-btn--light" href={DEMO_HREF}>
              Minta demo &amp; lisensi
            </Link>
          </div>
          <nav className="ent-footer__cols" aria-label="Navigasi footer">
            <div className="ent-footer__col">
              <p className="ent-footer__heading">Kapabilitas</p>
              <ul>
                {NAV_ITEMS.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="ent-footer__col">
              <p className="ent-footer__heading">Modul</p>
              <ul>
                {MODULE_LINKS.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="ent-footer__col">
              <p className="ent-footer__heading">Kontak</p>
              <ul>
                <li>
                  <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                </li>
                <li>
                  <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer">
                    WhatsApp {WHATSAPP_DISPLAY}
                  </a>
                </li>
                <li>
                  <a href={COMPANY.website} target="_blank" rel="noopener noreferrer">
                    arahkarya.com
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="ent-footer__bottom">
          <p>
            © {year} {COMPANY.name}. Hak cipta dilindungi.
          </p>
          <div className="ent-footer__theme" role="radiogroup" aria-label="Tema tampilan">
            {(["light", "dark"] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={theme === t} className="ent-footer__theme-btn" onClick={() => setTheme(t)}>
                {t === "light" ? "Terang" : "Gelap"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
