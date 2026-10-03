/** Site-wide navigation and contact details for the Entaris marketing site. */

export type NavItem = { href: string; label: string; description: string };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Produk", description: "Modul ERP dalam satu buku besar" },
  { href: "/aira", label: "AIRA", description: "Agen AI yang bernalar di atas data Anda" },
  { href: "/self-hosted", label: "Self-hosted", description: "Deploy di server Anda, data milik Anda" },
];

export const CONTACT_EMAIL = "solutions@arahkarya.com";

export const DEMO_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Permintaan demo Entaris")}`;

export const COMPANY = {
  name: "PT Arah Karya Sinergi",
  short: "Arah",
  website: "https://arahkarya.com",
} as const;
