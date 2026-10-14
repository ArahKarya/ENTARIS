import { SectionEyebrow } from "./SectionEyebrow";
import { BUSINESS_TYPES } from "./homeContent";
import { CP_HREF, CP_MESSAGE_FOR_BUSINESS, whatsappHref } from "@/components/site/siteConfig";

/** #cocok-untuk: business types Entaris fits. Each opens WhatsApp to the CP with the type already in the message. */
export function BusinessTypesSection() {
  return (
    <section id="cocok-untuk" className="home-fit" aria-labelledby="cocok-heading">
      <div className="home-section-head">
        <SectionEyebrow name="Cocok untuk" context="Dari toko hingga pabrik" />
        <h2 id="cocok-heading" className="home-section-title">
          Usaha seperti apa yang memakai Entaris
        </h2>
        <p className="home-section-lead">
          Pilih yang paling mirip dengan usaha Anda. WhatsApp ke CP akan terbuka dengan pesan yang sudah terisi.
        </p>
      </div>
      <ul className="home-fit__grid">
        {BUSINESS_TYPES.map((type) => (
          <li key={type} className="home-fit__cell">
            <a
              className="home-fit__link"
              href={whatsappHref(CP_MESSAGE_FOR_BUSINESS(type))}
              target="_blank"
              rel="noopener noreferrer"
            >
              {type}
            </a>
          </li>
        ))}
      </ul>
      <p className="home-fit__other">
        Usaha Anda belum ada di daftar?{" "}
        <a href={CP_HREF} target="_blank" rel="noopener noreferrer">
          Ceritakan lewat WhatsApp
        </a>
        .
      </p>
    </section>
  );
}
