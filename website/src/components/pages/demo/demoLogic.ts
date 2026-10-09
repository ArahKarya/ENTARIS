import { CONTACT_EMAIL, WHATSAPP_NUMBER } from "@/components/site/siteConfig";

/** Pure logic of the "Minta demo" intake form: options, validation, summary and hand-over links. */

export type Channel = "email" | "whatsapp";

export type DemoValues = {
  name: string;
  company: string;
  role: string;
  industry: string;
  size: string;
  currentSystem: string;
  email: string;
  whatsapp: string;
  channel: Channel | "";
  wishes: string;
};

export type DemoField = keyof DemoValues;
export type DemoErrors = Partial<Record<DemoField, string>>;

export const EMPTY_VALUES: DemoValues = {
  name: "",
  company: "",
  role: "",
  industry: "",
  size: "",
  currentSystem: "",
  email: "",
  whatsapp: "",
  channel: "",
  wishes: "",
};

export const INDUSTRY_OPTIONS = ["UKM & retail", "Distribusi & trading", "Manufaktur", "Kantor akuntan & konsultan", "Lainnya"] as const;
export const SIZE_OPTIONS = ["1–10", "11–50", "51–200", ">200"] as const;
export const SYSTEM_OPTIONS = ["Excel / buku tulis", "Software akuntansi", "ERP lain", "Belum ada"] as const;

export const CHANNEL_LABELS: Record<Channel, string> = { email: "Email", whatsapp: "WhatsApp" };

const REQUIRED: readonly DemoField[] = ["name", "company", "industry", "size", "email", "whatsapp", "channel"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const digitsOnly = (value: string): string => value.replace(/\D/g, "");

/** Returns one message per invalid field; an empty object means the form can continue. */
export function validate(values: DemoValues): DemoErrors {
  const errors: DemoErrors = {};
  for (const field of REQUIRED) {
    if (!values[field].trim()) errors[field] = field === "channel" ? "Pilih salah satu." : "Wajib diisi.";
  }
  if (!errors.email && !EMAIL_PATTERN.test(values.email.trim())) errors.email = "Format email belum benar.";
  if (!errors.whatsapp) {
    const length = digitsOnly(values.whatsapp).length;
    if (length < 9 || length > 15) errors.whatsapp = "Nomor WhatsApp harus 9–15 digit.";
  }
  return errors;
}

const clean = (value: string): string => value.trim().replace(/\s+/g, " ");

/** Human-readable lines (label, value) of everything the visitor filled in; empty fields are skipped. */
export function summaryLines(values: DemoValues): readonly (readonly [string, string])[] {
  const entries: readonly (readonly [string, string])[] = [
    ["Nama", clean(values.name)],
    ["Perusahaan", clean(values.company)],
    ["Jabatan", clean(values.role)],
    ["Bidang usaha", values.industry],
    ["Jumlah karyawan", values.size],
    ["Sistem sekarang", values.currentSystem],
    ["Email", clean(values.email)],
    ["WhatsApp", clean(values.whatsapp)],
    ["Dihubungi lewat", values.channel ? CHANNEL_LABELS[values.channel] : ""],
    ["Ingin dilihat saat demo", values.wishes.trim()],
  ];
  return entries.filter(([, value]) => value !== "");
}

export function buildSummary(values: DemoValues): string {
  const body = summaryLines(values)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
  return `Halo, saya ingin meminta demo Entaris.\n\n${body}`;
}

export function whatsappHref(values: DemoValues): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildSummary(values))}`;
}

export function emailHref(values: DemoValues): string {
  const subject = `Permintaan demo Entaris: ${clean(values.company)}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildSummary(values))}`;
}
