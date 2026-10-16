import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { CP_HREF, CP_LABEL, DEMO_APP_URL } from "@/components/site/siteConfig";
import { InfoMatrix } from "@/components/pages/InfoMatrix";
import { PageCta } from "@/components/pages/PageCta";
import { PageFrame } from "@/components/pages/PageFrame";
import { PageHero } from "@/components/pages/PageHero";

export const metadata: Metadata = {
  title: "Coba Demo: akun untuk mencoba Entaris",
  description: "Masuk ke aplikasi demo Entaris dengan akun contoh. Data di demo hanya contoh, jangan memasukkan data asli.",
};

const DEMO_ACCOUNTS = [
  ["Admin", "admin@entaris.demo", "12345678", "Akses penuh: melihat dan mengubah semua modul."],
  ["Viewer", "viewer@entaris.demo", "Admin123!", "Hanya melihat. Cocok untuk menjelajah tanpa risiko mengubah data."],
] as const;

export default function Page() {
  const rows: readonly (readonly React.ReactNode[])[] = DEMO_ACCOUNTS.map(([role, email, password, note]) => [
    role,
    <code key="e">{email}</code>,
    <code key="p">{password}</code>,
    note,
  ]);
  return (
    <SiteShell>
      <PageFrame
        hero={
          <PageHero
            eyebrow={{ name: "Coba Demo" }}
            lines={["Coba Entaris sendiri,", "tanpa daftar."]}
            lead="Salin email dan kata sandi di bawah, lalu buka aplikasi demo dan masuk. Datanya hanya contoh."
            primary={{ label: "Buka aplikasi demo", href: DEMO_APP_URL, arrow: true }}
            compact
          />
        }
      >
        <InfoMatrix
          id="akun"
          kicker="Akun demo"
          title="Pilih akun, lalu masuk."
          lead="Aplikasi demo terbuka di tab baru. Di halaman masuk, ketik email dan kata sandi dari tabel ini."
          head={["Akun", "Email", "Kata sandi", "Yang bisa dilakukan"]}
          rows={rows}
          columns="minmax(7rem, 0.14fr) minmax(0, 0.26fr) minmax(0, 0.2fr) minmax(0, 0.4fr)"
          ariaLabel="Daftar akun demo Entaris"
          note="Ini server demo bersama. Jangan memasukkan data asli atau rahasia, karena pengguna lain bisa ikut melihatnya."
        />
        <PageCta
          lines={["Ingin dicoba dengan", "data usaha Anda?"]}
          text="Ceritakan kebutuhan Anda lewat WhatsApp. CP akan membantu menyiapkannya."
          primary={{ label: CP_LABEL, href: CP_HREF, arrow: true }}
        />
      </PageFrame>
    </SiteShell>
  );
}
