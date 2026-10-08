"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "./HomeIcons";
import { AiraMark } from "@/components/site/AiraLogo";
import { DEMO_HREF } from "@/components/site/siteConfig";
import type { FeaturedModule } from "./FeaturedModules";

type ModuleDetailModalProps = {
  module: FeaturedModule | null;
  onClose: () => void;
};

export function ModuleDetailModal({ module, onClose }: ModuleDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"flow" | "gl" | "roles" | "aira">("flow");

  useEffect(() => {
    if (!module) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [module, onClose]);

  if (!module) return null;

  return (
    <div
      className="module-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="module-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="module-modal-window" style={{ "--modal-accent": module.color } as React.CSSProperties}>
        {/* Header */}
        <div className="module-modal-header">
          <div className="module-modal-header__meta">
            <span className="module-modal-pill">{module.category}</span>
            <span className="module-modal-code">Modul #{module.number}</span>
          </div>
          <button
            type="button"
            className="module-modal-close"
            onClick={onClose}
            aria-label="Tutup jendela detail modul"
          >
            <Icon name="x" style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div className="module-modal-hero">
          <h3 id="module-modal-title" className="module-modal-title">
            {module.name}
          </h3>
          <p className="module-modal-desc">{module.desc}</p>
        </div>

        {/* Tab Controls */}
        <div className="module-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "flow"}
            className={`module-modal-tab ${activeTab === "flow" ? "is-active" : ""}`}
            onClick={() => setActiveTab("flow")}
          >
            <Icon name="layers" style={{ width: 15, height: 15 }} />
            <span>Alur Transaksi</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "gl"}
            className={`module-modal-tab ${activeTab === "gl" ? "is-active" : ""}`}
            onClick={() => setActiveTab("gl")}
          >
            <Icon name="finance" style={{ width: 15, height: 15 }} />
            <span>Dampak PSAK & buku besar</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "roles"}
            className={`module-modal-tab ${activeTab === "roles" ? "is-active" : ""}`}
            onClick={() => setActiveTab("roles")}
          >
            <Icon name="userCheck" style={{ width: 15, height: 15 }} />
            <span>Hak Akses Tim</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "aira"}
            className={`module-modal-tab ${activeTab === "aira" ? "is-active" : ""}`}
            onClick={() => setActiveTab("aira")}
          >
            <AiraMark size={14} />
            <span>Bantuan AIRA</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="module-modal-body">
          {activeTab === "flow" && (
            <div className="module-modal-flow-wrap">
              <h4 className="module-modal-section-title">Rantai Dokumen Berurutan:</h4>
              <ol className="module-modal-flow-list">
                {module.flow.map((step, idx) => (
                  <li key={step} className="module-modal-flow-item">
                    <span className="module-modal-flow-badge">{idx + 1}</span>
                    <div className="module-modal-flow-content">
                      <span className="module-modal-flow-label">{step}</span>
                      <span className="module-modal-flow-hint">
                        {idx === 0
                          ? "Dokumen inisiasi oleh tim terkait"
                          : idx === module.flow.length - 1
                          ? "Posting final ke buku besar & audit trail tersimpan"
                          : "Pemeriksaan wewenang & validasi dokumen"}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {activeTab === "gl" && (
            <div className="module-modal-gl-wrap">
              <h4 className="module-modal-section-title">Perlakuan Akuntansi & Buku Besar:</h4>
              <div className="module-modal-callout">
                <Icon name="certificate" style={{ width: 20, height: 20, flexShrink: 0 }} />
                <p>{module.glImpact}</p>
              </div>
              <ul className="module-modal-gl-features">
                <li>
                  <Icon name="check" style={{ width: 14, height: 14 }} />
                  <span>Double-entry otomatis tanpa perlu menjurnal manual untuk transaksi rutin.</span>
                </li>
                <li>
                  <Icon name="check" style={{ width: 14, height: 14 }} />
                  <span>Jejak audit (audit trail) mencatat nama pembuat, approver, waktu, dan nilai before/after.</span>
                </li>
                <li>
                  <Icon name="check" style={{ width: 14, height: 14 }} />
                  <span>Laporan Neraca dan Laba Rugi langsung mencerminkan data detik yang sama.</span>
                </li>
              </ul>
            </div>
          )}

          {activeTab === "roles" && (
            <div className="module-modal-roles-wrap">
              <h4 className="module-modal-section-title">Pembagian Wewenang & Hak Akses:</h4>
              <div className="module-modal-callout">
                <Icon name="userCheck" style={{ width: 20, height: 20, flexShrink: 0 }} />
                <p>{module.roles}</p>
              </div>
              <p className="module-modal-subtext">
                Entaris menyediakan 4 peran bawaan (Admin, Operasional, Keuangan, Auditor). Anda juga dapat membuat peran custom
                sesuai bagan organisasi perusahaan Anda.
              </p>
            </div>
          )}

          {activeTab === "aira" && (
            <div className="module-modal-aira-wrap">
              <h4 className="module-modal-section-title">Peran AIRA (Agen AI Entaris) di Modul Ini:</h4>
              <div className="module-modal-callout module-modal-callout--aira">
                <AiraMark size={20} />
                <p>{module.airaCapability}</p>
              </div>
              <div className="module-modal-aira-note">
                <strong>Catatan Keamanan:</strong> AIRA tunduk pada hak akses pengguna yang bertanya. Secara bawaan, seluruh tindakan finansial berhenti sebagai <em>draf</em> atau antrean persetujuan dan wajib disetujui staf berwenang sebelum menyentuh buku besar.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="module-modal-footer">
          <Link href={DEMO_HREF} className="module-modal-cta" onClick={onClose}>
            <span>Minta demo modul ini</span>
            <Icon name="arrowRight" style={{ width: 16, height: 16 }} />
          </Link>
          <button type="button" className="module-modal-dismiss" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
