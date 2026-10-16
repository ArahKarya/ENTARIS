"use client";

import { useState } from "react";
import Link from "next/link";
import { SectionEyebrow } from "./SectionEyebrow";
import { CP_HREF, CP_LABEL, DEMO_HREF, DEMO_LABEL } from "@/components/site/siteConfig";

/** Overview video. The poster loads first; the YouTube player (privacy-enhanced domain) only after the click. */
export const OVERVIEW_VIDEO_ID = "M2bbATerSRI";
export const OVERVIEW_VIDEO_TITLE = "Entaris ERP dan AIRA: satu sistem untuk mengurus seluruh bisnis Anda";

const HIGHLIGHTS = [
  { title: "Satu buku besar", text: "Penjualan, pembelian, inventori, produksi, keuangan, dan aset tercatat di satu tempat." },
  { title: "AIRA ikut bekerja", text: "Tanya data, susun draf, dan analisis laporan. Perubahan pembukuan menunggu persetujuan Anda." },
  { title: "Data di server Anda", text: "Perangkat lunak terbuka (AGPL-3.0), tanpa biaya lisensi." },
] as const;

type VideoShowcaseProps = { id?: string; withHead?: boolean };

export function VideoShowcase({ id = "video", withHead = true }: VideoShowcaseProps) {
  const [playing, setPlaying] = useState(false);
  return (
    <section id={id} className="home-video" aria-labelledby={`${id}-heading`}>
      {withHead ? (
        <div className="home-section-head">
          <SectionEyebrow name="Lihat Entaris" context="Video singkat" />
          <h2 id={`${id}-heading`} className="home-section-title">
            Entaris dan AIRA dalam satu video
          </h2>
          <p className="home-section-lead">Tonton gambaran lengkapnya: modul, AIRA, dan cara Entaris mengurus seluruh bisnis Anda dalam satu sistem.</p>
        </div>
      ) : (
        <h2 id={`${id}-heading`} className="sr-only">
          {OVERVIEW_VIDEO_TITLE}
        </h2>
      )}
      <div className="home-video__layout">
        <div className="home-video__frame">
          {playing ? (
            <iframe
              className="home-video__player"
              src={`https://www.youtube-nocookie.com/embed/${OVERVIEW_VIDEO_ID}?autoplay=1&rel=0`}
              title={OVERVIEW_VIDEO_TITLE}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <button type="button" className="home-video__poster" onClick={() => setPlaying(true)} aria-label={`Putar video: ${OVERVIEW_VIDEO_TITLE}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube poster, loaded lazily */}
              <img src={`https://i.ytimg.com/vi/${OVERVIEW_VIDEO_ID}/hqdefault.jpg`} alt="" loading="lazy" width={480} height={360} />
              <span className="home-video__play" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </button>
          )}
        </div>
        <aside className="home-video__aside" aria-label="Ringkasan isi video">
          <p className="home-video__meta">Durasi 1:24</p>
          <ul className="home-video__points">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
          <div className="home-video__actions">
            <Link href={DEMO_HREF} className="hero-catalog__cta hero-catalog__cta--primary">
              <span>{DEMO_LABEL}</span>
            </Link>
            <a href={CP_HREF} target="_blank" rel="noopener noreferrer" className="home-video__link">
              {CP_LABEL}
            </a>
          </div>
        </aside>
      </div>
    </section>
  );
}
