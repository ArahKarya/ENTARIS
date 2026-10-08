import { WHATSAPP_DISPLAY, CONTACT_EMAIL } from "@/components/site/siteConfig";
import { emailHref, summaryLines, whatsappHref, type DemoValues } from "./demoLogic";

type DemoConfirmationProps = { values: DemoValues; onEdit: () => void; headingRef: React.Ref<HTMLHeadingElement> };

/*
 * Step 2: nothing has been sent yet (the site has no server); the visitor picks WhatsApp or email
 * and the message opens pre-filled with the summary. The preferred channel is the primary button.
 */
export function DemoConfirmation({ values, onEdit, headingRef }: DemoConfirmationProps) {
  const whatsappPrimary = values.channel !== "email";
  return (
    <div className="demo-card demo-confirm" aria-live="polite">
      <p className="demo-confirm__kicker">Langkah terakhir</p>
      <h2 ref={headingRef} tabIndex={-1}>
        Satu langkah lagi: kirim ringkasan ke tim kami.
      </h2>
      <p className="demo-confirm__lead">Pilih saluran yang Anda mau. Ringkasan data Anda sudah terisi otomatis di pesannya.</p>
      <div className="demo-confirm__actions">
        <a className={`ent-btn ${whatsappPrimary ? "ent-btn--solid" : "ent-btn--ghost"}`} href={whatsappHref(values)} target="_blank" rel="noopener noreferrer">
          Lanjut via WhatsApp
        </a>
        <a className={`ent-btn ${whatsappPrimary ? "ent-btn--ghost" : "ent-btn--solid"}`} href={emailHref(values)}>
          Lanjut via Email
        </a>
      </div>
      <p className="demo-confirm__note">Pesan baru sampai ke tim kami setelah Anda menekan salah satu tombol di atas.</p>
      <dl className="demo-summary">
        {summaryLines(values).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="demo-confirm__footer">
        <button type="button" className="ent-btn ent-btn--ghost" onClick={onEdit}>
          Ubah isian
        </button>
        <p>
          Lebih suka menghubungi langsung? WhatsApp {WHATSAPP_DISPLAY} · {CONTACT_EMAIL}
        </p>
      </div>
    </div>
  );
}
