/** Site-wide navigation and contact details for the Entaris marketing site. */

export type NavItem = { href: string; label: string; description: string };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/modul", label: "Modul", description: "Semua modul Entaris dalam satu buku besar" },
  { href: "/aira", label: "AIRA", description: "Agen AI yang ikut bekerja di atas data Anda" },
  { href: "/harga", label: "Harga dan Misi", description: "Bayar semampunya, dan 30% untuk sosial" },
  { href: "/docs", label: "Dokumentasi", description: "Panduan setup dari awal dan fungsi tiap modul ERP" },
];

/** Secondary pages: reachable from the footer, not the main menu. */
export const FOOTER_PAGES: readonly NavItem[] = [
  { href: "/migrasi", label: "Migrasi", description: "Pindah ke Entaris cukup lewat chat dengan AIRA" },
  { href: "/integrasi", label: "Integrasi", description: "Terhubung dengan bank, pajak, dan aplikasi yang sudah Anda pakai" },
  { href: "/laporan-donasi", label: "Laporan Donasi", description: "Ke mana 30% itu pergi, dilaporkan tiap bulan" },
];

export const CONTACT_EMAIL = "yayangsn@arahkarya.com";

/** WhatsApp number in wa.me format (country code, no plus sign or spaces) and as displayed. */
export const WHATSAPP_NUMBER = "6282282747444";
export const WHATSAPP_DISPLAY = "0822-8274-7444";

/** Every contact button opens WhatsApp to the contact person (CP) with a ready-made first message. */
export const DEMO_LABEL = "Coba Demo";
export const DEMO_HREF = "https://entaris-demo.arahkarya.com";
export const CP_LABEL = "Hubungi CP";
export const CP_MESSAGE = "Halo, saya tertarik dengan Entaris dan ingin tahu lebih lanjut.";
export const whatsappHref = (message: string): string => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
export const CP_HREF = whatsappHref(CP_MESSAGE);
export const CP_MESSAGE_FOR_BUSINESS = (businessType: string): string =>
  `Halo, usaha saya: ${businessType}. Saya tertarik dengan Entaris dan ingin tahu apakah cocok untuk usaha saya.`;
export const CP_MESSAGE_FOR_MODULE = (moduleName: string): string => `Halo, saya tertarik dengan modul ${moduleName} di Entaris dan ingin tahu lebih lanjut.`;

export const ENTARIS_FULL = "Enterprise Agentic Reasoning Integrated System";
export const AIRA_FULL = "Artificial Intelligence Reasoning Agent";
export const TAGLINE_MAIN = "Sistem yang ikut bertumbuh dengan bisnis kamu";
export const TAGLINE_SECONDARY = "ERP biasa menunggu diisi; Entaris ikut bekerja.";

export const COMPANY = {
  name: "PT Arah Karya Sinergi",
  short: "Arah",
  website: "https://arahkarya.com",
} as const;

/** Tautan donasi sukarela (Trakteer/Saweria/GitHub Sponsors/QRIS). Isi lewat env saat build; kosong = tombol disembunyikan. */
export const DONATE_URL = process.env.NEXT_PUBLIC_DONATE_URL || "";
