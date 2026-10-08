import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL, WHATSAPP_NUMBER } from "@/components/site/siteConfig";
import { EMPTY_VALUES, buildSummary, emailHref, summaryLines, validate, whatsappHref, type DemoValues } from "./demoLogic";

const VALID: DemoValues = {
  name: "  Budi   Santoso ",
  company: "PT Sinar Pangan",
  role: "Direktur",
  industry: "Manufaktur",
  size: "51–200",
  currentSystem: "Excel / buku tulis",
  email: "budi@sinarpangan.example",
  whatsapp: "0812-3456-7890",
  channel: "whatsapp",
  wishes: "Lihat HPP per batch",
};

describe("validate", () => {
  it("accepts a complete form", () => {
    expect(validate(VALID)).toEqual({});
  });

  it("flags every required field of an empty form but not the optional ones", () => {
    const errors = validate(EMPTY_VALUES);
    expect(Object.keys(errors).sort()).toEqual(["channel", "company", "email", "industry", "name", "size", "whatsapp"]);
    expect(errors.role).toBeUndefined();
    expect(errors.currentSystem).toBeUndefined();
    expect(errors.wishes).toBeUndefined();
  });

  it("treats whitespace-only input as empty", () => {
    expect(validate({ ...VALID, name: "   " }).name).toBe("Wajib diisi.");
  });

  it("rejects a malformed email and keeps the required message for an empty one", () => {
    expect(validate({ ...VALID, email: "budi@" }).email).toBe("Format email belum benar.");
    expect(validate({ ...VALID, email: "" }).email).toBe("Wajib diisi.");
  });

  it("checks the WhatsApp number by digit count, ignoring separators", () => {
    expect(validate({ ...VALID, whatsapp: "+62 812-3456-7890" }).whatsapp).toBeUndefined();
    expect(validate({ ...VALID, whatsapp: "12345" }).whatsapp).toBe("Nomor WhatsApp harus 9–15 digit.");
    expect(validate({ ...VALID, whatsapp: "1234567890123456" }).whatsapp).toBe("Nomor WhatsApp harus 9–15 digit.");
  });

  it("requires a contact channel", () => {
    expect(validate({ ...VALID, channel: "" }).channel).toBe("Pilih salah satu.");
  });

  it("does not mutate its input", () => {
    const copy = { ...VALID };
    validate(copy);
    expect(copy).toEqual(VALID);
  });
});

describe("summary", () => {
  it("normalises whitespace and skips empty optional fields", () => {
    const lines = summaryLines({ ...VALID, role: "", wishes: "  " });
    expect(lines[0]).toEqual(["Nama", "Budi Santoso"]);
    expect(lines.map(([label]) => label)).not.toContain("Jabatan");
    expect(lines.map(([label]) => label)).not.toContain("Ingin dilihat saat demo");
  });

  it("writes the channel as a readable label", () => {
    expect(summaryLines(VALID)).toContainEqual(["Dihubungi lewat", "WhatsApp"]);
  });

  it("omits the contact-channel line when none was chosen", () => {
    expect(summaryLines({ ...VALID, channel: "" }).map(([label]) => label)).not.toContain("Dihubungi lewat");
  });

  it("builds a greeting followed by one line per entry", () => {
    const text = buildSummary(VALID);
    expect(text.startsWith("Halo, saya ingin meminta demo Entaris.\n\n")).toBe(true);
    expect(text).toContain("Perusahaan: PT Sinar Pangan");
    expect(text).toContain("Ingin dilihat saat demo: Lihat HPP per batch");
  });
});

describe("hand-over links", () => {
  it("opens WhatsApp chat to the configured number with the summary pre-filled", () => {
    const href = whatsappHref(VALID);
    expect(href.startsWith(`https://wa.me/${WHATSAPP_NUMBER}?text=`)).toBe(true);
    expect(decodeURIComponent(href.split("?text=")[1])).toBe(buildSummary(VALID));
  });

  it("opens a mail to the configured address with company in the subject and summary in the body", () => {
    const href = emailHref(VALID);
    expect(href.startsWith(`mailto:${CONTACT_EMAIL}?subject=`)).toBe(true);
    const query = new URLSearchParams(href.split("?")[1]);
    expect(query.get("subject")).toBe("Permintaan demo Entaris: PT Sinar Pangan");
    expect(query.get("body")).toBe(buildSummary(VALID));
  });

  it("keeps line breaks and special characters intact through encoding", () => {
    const href = whatsappHref({ ...VALID, wishes: "Rp 1.000 & lain-lain\nbaris dua" });
    expect(decodeURIComponent(href.split("?text=")[1])).toContain("Rp 1.000 & lain-lain\nbaris dua");
  });
});
