"use client";

import Link from "next/link";
import { useErpRoot } from "@/components/erp/shared/ErpRoot";
import { EntarisLogo } from "./EntarisLogo";
import { COMPANY, CONTACT_EMAIL, CP_HREF, DONATE_URL, GITHUB_LABEL, GITHUB_URL, CP_LABEL, FOOTER_PAGES, NAV_ITEMS, WHATSAPP_DISPLAY, WHATSAPP_NUMBER } from "./siteConfig";

const MODULE_LINKS = [
  { href: "/modul#modul-penjualan", label: "Penjualan" },
  { href: "/modul#modul-pembelian", label: "Pembelian" },
  { href: "/modul#modul-inventori", label: "Inventori" },
  { href: "/modul#modul-produksi", label: "Produksi" },
  { href: "/modul#modul-keuangan", label: "Keuangan" },
  { href: "/modul#modul-aset", label: "Aset (EAM)" },
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
              Sistem yang ikut bertumbuh dengan bisnis Anda. Dibangun dengan pembukuan otomatis sebagai fondasi dan agen AI AIRA yang ikut bekerja di atas data transaksi Anda. Perangkat lunak terbuka (AGPL-3.0) untuk kemajuan UMKM, bangsa, dan negara. Berjalan di server Anda sendiri, jadi datanya milik Anda.
            </p>
            <a className="ent-btn ent-btn--light" href={CP_HREF} target="_blank" rel="noopener noreferrer">
              {CP_LABEL}
            </a>
            <a className="ent-btn ent-btn--light" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              {GITHUB_LABEL}
            </a>
            {DONATE_URL ? (
              <a className="ent-btn ent-btn--light" href={DONATE_URL} target="_blank" rel="noopener noreferrer">
                Dukung Entaris
              </a>
            ) : null}
          </div>
          <nav className="ent-footer__cols" aria-label="Navigasi footer">
            <div className="ent-footer__col">
              <p className="ent-footer__heading">Jelajahi</p>
              <ul>
                {[...NAV_ITEMS, ...FOOTER_PAGES].map((item) => (
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
            © {year} {COMPANY.name}. Perangkat lunak bebas, lisensi AGPL-3.0.
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
