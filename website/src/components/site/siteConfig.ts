/** Site-wide navigation and contact details for the Entaris marketing site. */

export type NavItem = { href: string; label: string; description: string };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Kapabilitas", description: "Modul ERP dalam satu buku besar" },
  { href: "/integrasi", label: "Integrasi", description: "Terhubung dengan bank, pajak, dan aplikasi yang sudah Anda pakai" },
  { href: "/aira", label: "AIRA", description: "Agen AI yang bernalar di atas data Anda" },
  { href: "/migrasi", label: "Migrasi", description: "Pindah ke Entaris cukup lewat chat dengan AIRA" },
  { href: "/impact", label: "Impact", description: "Contoh industri dan cerita para pengguna Entaris" },
];

export const CONTACT_EMAIL = "yayangsn@arahkarya.com";

/** WhatsApp number in wa.me format (country code, no plus sign or spaces) and as displayed. */
export const WHATSAPP_NUMBER = "6282282747444";
export const WHATSAPP_DISPLAY = "0822-8274-7444";

/** Every "Minta demo" button opens the intake form first; it then hands over to WhatsApp or email. */
export const DEMO_HREF = "/minta-demo";

export const COMPANY = {
  name: "PT Arah Karya Sinergi",
  short: "Arah",
  website: "https://arahkarya.com",
} as const;
