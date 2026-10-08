"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { DOC_COLLECTIONS, type DocArticle, type DocCollection } from "./docsData";
import { WHATSAPP_DISPLAY, WHATSAPP_NUMBER, DEMO_HREF } from "@/components/site/siteConfig";
import { EntarisLogo } from "@/components/site/EntarisLogo";

// --- SVG Icons Helper ---
function DocIcon({ name, className = "" }: { name: string; className?: string }) {
  const props = {
    xmlns: "http://www.w3.org/2000/svg",
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };

  switch (name) {
    case "rocket":
      return (
        <svg {...props}>
          <path d="M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3" />
          <path d="M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3" />
          <circle cx="15" cy="9" r="1" />
        </svg>
      );
    case "book":
    case "akuntansi":
      return (
        <svg {...props}>
          <path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
          <path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
          <path d="M3 6l0 13" />
          <path d="M12 6l0 13" />
          <path d="M21 6l0 13" />
        </svg>
      );
    case "sales":
    case "penjualan":
      return (
        <svg {...props}>
          <circle cx="6" cy="19" r="2" />
          <circle cx="17" cy="19" r="2" />
          <path d="M17 17h-11v-14h-2" />
          <path d="M6 5l14 1l-1 7h-13" />
        </svg>
      );
    case "purchase":
    case "pembelian":
      return (
        <svg {...props}>
          <circle cx="7" cy="17" r="2" />
          <circle cx="17" cy="17" r="2" />
          <path d="M5 17h-2v-4m-1 -8h11v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" />
          <path d="M3 9h4" />
        </svg>
      );
    case "bank":
    case "kas-bank":
      return (
        <svg {...props}>
          <path d="M3 21h18" />
          <path d="M3 10h18" />
          <path d="M5 6l7 -3l7 3" />
          <path d="M4 10v11" />
          <path d="M20 10v11" />
          <path d="M8 14v3" />
          <path d="M12 14v3" />
          <path d="M16 14v3" />
        </svg>
      );
    case "production":
    case "produksi":
      return (
        <svg {...props}>
          <path d="M3 21h18" />
          <path d="M5 21v-12l5 4v-4l5 4h4" />
          <path d="M19 21v-8l-1.436 -9.574a.5 .5 0 0 0 -.495 -.426h-1.145a.5 .5 0 0 0 -.494 .418l-1.43 8.582" />
        </svg>
      );
    case "asset":
    case "eam-aset":
      return (
        <svg {...props}>
          <path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5" />
        </svg>
      );
    case "reports":
    case "laporan-pajak":
      return (
        <svg {...props}>
          <path d="M14 3v4a1 1 0 0 0 1 1h4" />
          <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
          <line x1="9" y1="9" x2="10" y2="9" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      );
    case "aira":
    case "aira-mcp":
      return (
        <svg {...props}>
          <path d="M12 3c1.9 0 3.6 1.1 4.4 2.8a4.9 4.9 0 0 1 3.6 5.2c0 2.2 -1.4 4.1 -3.4 4.7a5 5 0 0 1 -4.6 3.3a5 5 0 0 1 -4.6 -3.3c-2 -.6 -3.4 -2.5 -3.4 -4.7a4.9 4.9 0 0 1 3.6 -5.2a4.9 4.9 0 0 1 4.4 -2.8z" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "shield":
    case "governance":
      return (
        <svg {...props}>
          <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" />
          <path d="M9 12l2 2l4 -4" />
        </svg>
      );
    case "search":
      return (
        <svg {...props}>
          <circle cx="10" cy="10" r="7" />
          <line x1="21" y1="21" x2="15" y2="15" />
        </svg>
      );
    case "copy":
      return (
        <svg {...props}>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case "terminal":
      return (
        <svg {...props}>
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      );
    case "file-text":
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0 -2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...props}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      );
    case "chevron-left":
      return (
        <svg {...props}>
          <polyline points="15 18 9 12 15 6" />
        </svg>
      );
    case "x":
      return (
        <svg {...props}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    case "menu":
      return (
        <svg {...props}>
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      );
    case "external-link":
      return (
        <svg {...props}>
          <path d="M18 13v6a2 2 0 0 1 -2 2H5a2 2 0 0 1 -2 -2V8a2 2 0 0 1 2 -2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      );
    case "info":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    case "warning":
      return (
        <svg {...props}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71 -3L13.71 3.86a2 2 0 0 0 -3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "lightbulb":
      return (
        <svg {...props}>
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0 -7 7c0 2.5 1.2 4.6 3.1 5.9a1 1 0 0 1 .4.8v1.3a1 1 0 0 0 1 1h5a1 1 0 0 0 1 -1v-1.3a1 1 0 0 1 .4 -.8c1.9 -1.3 3.1 -3.4 3.1 -5.9a7 7 0 0 0 -7 -7z" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}

export function DocsPortal() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Active collection and article states
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("setup");
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>("quickstart-docker");

  // Search Modal state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Mobile sidebar drawer state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync state with URL params on mount / change
  useEffect(() => {
    const cParam = searchParams.get("c");
    const aParam = searchParams.get("a");

    if (cParam && DOC_COLLECTIONS.some((c) => c.id === cParam)) {
      setSelectedCollectionId(cParam);
      if (aParam) {
        setSelectedArticleId(aParam);
      } else {
        setSelectedArticleId(null);
      }
    } else if (aParam) {
      // Find collection containing this article
      const foundCollection = DOC_COLLECTIONS.find((c) => c.articles.some((a) => a.id === aParam));
      if (foundCollection) {
        setSelectedCollectionId(foundCollection.id);
        setSelectedArticleId(aParam);
      }
    }
  }, [searchParams]);

  // Keyboard shortcut for Search (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Update navigation helper
  const navigateTo = useCallback(
    (collectionId: string, articleId: string | null = null) => {
      setSelectedCollectionId(collectionId);
      setSelectedArticleId(articleId);
      setIsMobileMenuOpen(false);
      setIsSearchOpen(false);

      const params = new URLSearchParams();
      params.set("c", collectionId);
      if (articleId) params.set("a", articleId);
      router.push(`/docs?${params.toString()}`, { scroll: true });
    },
    [router]
  );

  // Current active collection
  const currentCollection = useMemo(() => {
    return DOC_COLLECTIONS.find((c) => c.id === selectedCollectionId) || DOC_COLLECTIONS[0];
  }, [selectedCollectionId]);

  // Current active article
  const currentArticle = useMemo(() => {
    if (!selectedArticleId) return null;
    return currentCollection.articles.find((a) => a.id === selectedArticleId) || null;
  }, [currentCollection, selectedArticleId]);

  // Previous & Next articles for pagination
  const { prevArticle, nextArticle } = useMemo(() => {
    if (!currentArticle) return { prevArticle: null, nextArticle: null };
    const currentIndex = currentCollection.articles.findIndex((a) => a.id === currentArticle.id);
    const prev = currentIndex > 0 ? currentCollection.articles[currentIndex - 1] : null;
    const next = currentIndex < currentCollection.articles.length - 1 ? currentCollection.articles[currentIndex + 1] : null;
    return { prevArticle: prev, nextArticle: next };
  }, [currentCollection, currentArticle]);

  // Search filtering
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: { collection: DocCollection; article: DocArticle }[] = [];

    for (const collection of DOC_COLLECTIONS) {
      for (const article of collection.articles) {
        const matchesTitle = article.title.toLowerCase().includes(q);
        const matchesSummary = article.summary.toLowerCase().includes(q);
        const matchesCollection = collection.name.toLowerCase().includes(q);
        const matchesLead = article.content.lead.toLowerCase().includes(q);
        const matchesSection = article.content.sections.some(
          (s) =>
            s.heading.toLowerCase().includes(q) ||
            s.text?.toLowerCase().includes(q) ||
            s.code?.content.toLowerCase().includes(q) ||
            s.steps?.some((step) => step.title.toLowerCase().includes(q) || step.cmd?.toLowerCase().includes(q))
        );

        if (matchesTitle || matchesSummary || matchesCollection || matchesLead || matchesSection) {
          results.push({ collection, article });
        }
      }
    }
    return results;
  }, [searchQuery]);

  // Copy handler with visual feedback
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2200);
  };

  return (
    <div className="doc-portal">
      {/* ========================================================
          1. HEADER (Claude Support Style)
      ======================================================== */}
      <header className="doc-header">
        <div className="doc-header__left">
          <button
            type="button"
            className="doc-header__mobile-toggle"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            <DocIcon name={isMobileMenuOpen ? "x" : "menu"} />
          </button>
          <Link href="/docs" className="doc-header__brand" onClick={() => navigateTo("setup", null)}>
            <EntarisLogo />
            <span className="doc-header__brand-badge">Dokumentasi</span>
          </Link>
        </div>

        <div className="doc-header__center">
          <button
            type="button"
            className="doc-header__search-trigger"
            onClick={() => setIsSearchOpen(true)}
            aria-label="Cari dokumentasi (Tekan Cmd+K)"
          >
            <DocIcon name="search" className="doc-header__search-icon" />
            <span className="doc-header__search-placeholder">Cari modul, setup, perintah, atau PSAK...</span>
            <kbd className="doc-header__search-kbd">⌘K</kbd>
          </button>
        </div>

        <div className="doc-header__right">
          <nav className="doc-header__quick-links">
            <button
              type="button"
              className="doc-header__link"
              onClick={() => navigateTo("setup", "quickstart-docker")}
            >
              Quickstart
            </button>
            <button
              type="button"
              className="doc-header__link"
              onClick={() => navigateTo("aira-mcp", "arsitektur-mcp-aira")}
            >
              AIRA &amp; MCP
            </button>
            <Link href="/" className="doc-header__link doc-header__link--external">
              Web Utama
              <DocIcon name="external-link" className="doc-header__link-icon" />
            </Link>
          </nav>
          <Link href={DEMO_HREF} className="doc-header__cta-btn">
            Minta Demo
          </Link>
        </div>
      </header>

      {/* ========================================================
          2. MAIN LAYOUT: SIDEBAR + CONTENT
      ======================================================== */}
      <div className="doc-layout">
        {/* Backdrop for mobile drawer */}
        {isMobileMenuOpen && (
          <div className="doc-sidebar__backdrop" onClick={() => setIsMobileMenuOpen(false)} aria-hidden="true" />
        )}

        {/* LEFT SIDEBAR (Claude Support Style vertical category list) */}
        <aside className={`doc-sidebar ${isMobileMenuOpen ? "doc-sidebar--open" : ""}`}>
          <div className="doc-sidebar__inner">
            <div className="doc-sidebar__top-label">
              <span>Katalog Dokumentasi</span>
              <span className="doc-sidebar__total-badge">10 Modul</span>
            </div>

            <nav className="doc-sidebar__nav" aria-label="Navigasi Dokumentasi">
              <ul className="doc-sidebar__list">
                {DOC_COLLECTIONS.map((col) => {
                  const isColActive = col.id === selectedCollectionId;
                  return (
                    <li key={col.id} className={`doc-sidebar__item ${isColActive ? "doc-sidebar__item--active" : ""}`}>
                      <button
                        type="button"
                        className="doc-sidebar__category-btn"
                        onClick={() => {
                          if (isColActive && selectedArticleId === null) {
                            // Already on hub view
                          } else {
                            navigateTo(col.id, col.articles[0]?.id || null);
                          }
                        }}
                      >
                        <span className="doc-sidebar__category-icon">
                          <DocIcon name={col.icon} />
                        </span>
                        <span className="doc-sidebar__category-name">{col.name}</span>
                        <span className="doc-sidebar__count-pill">{col.articles.length}</span>
                        <span className={`doc-sidebar__caret ${isColActive ? "doc-sidebar__caret--open" : ""}`}>
                          <DocIcon name="chevron-right" />
                        </span>
                      </button>

                      {/* Expandable sub-list of articles when collection is active */}
                      {isColActive && (
                        <ul className="doc-sidebar__sublist">
                          <li className="doc-sidebar__subitem">
                            <button
                              type="button"
                              className={`doc-sidebar__sublink ${selectedArticleId === null ? "doc-sidebar__sublink--active" : ""}`}
                              onClick={() => navigateTo(col.id, null)}
                            >
                              <span className="doc-sidebar__subdot" />
                              <span>Ringkasan Modul</span>
                            </button>
                          </li>
                          {col.articles.map((art) => {
                            const isArtActive = selectedArticleId === art.id;
                            return (
                              <li key={art.id} className="doc-sidebar__subitem">
                                <button
                                  type="button"
                                  className={`doc-sidebar__sublink ${isArtActive ? "doc-sidebar__sublink--active" : ""}`}
                                  onClick={() => navigateTo(col.id, art.id)}
                                >
                                  <span className="doc-sidebar__subdot" />
                                  <span className="doc-sidebar__subtext">{art.title}</span>
                                  {art.badge && <span className="doc-sidebar__art-badge">{art.badge}</span>}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Sidebar Footer Callout */}
            <div className="doc-sidebar__footer">
              <div className="doc-sidebar__support-box">
                <span className="doc-sidebar__support-title">Self-Hosted &amp; Private</span>
                <p className="doc-sidebar__support-text">
                  Data 100% di server Anda. Membutuhkan bantuan setup on-premise atau migrasi data?
                </p>
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}?text=Halo%20Tim%20Entaris,%20saya%20ingin%20konsultasi%20setup%20dan%20implementasi`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="doc-sidebar__support-link"
                >
                  Hubungi Teknisi via WA ({WHATSAPP_DISPLAY})
                </a>
              </div>
            </div>
          </div>
        </aside>

        {/* RIGHT MAIN CONTENT AREA */}
        <main className="doc-main">
          {/* Breadcrumbs (Like Claude Support) */}
          <nav className="doc-breadcrumbs" aria-label="Breadcrumb">
            <button
              type="button"
              className="doc-breadcrumb__link"
              onClick={() => navigateTo("setup", null)}
            >
              Semua Koleksi
            </button>
            <span className="doc-breadcrumb__sep">›</span>
            <button
              type="button"
              className={`doc-breadcrumb__link ${selectedArticleId === null ? "doc-breadcrumb__link--current" : ""}`}
              onClick={() => navigateTo(currentCollection.id, null)}
            >
              {currentCollection.name}
            </button>
            {currentArticle && (
              <>
                <span className="doc-breadcrumb__sep">›</span>
                <span className="doc-breadcrumb__current">{currentArticle.title}</span>
              </>
            )}
          </nav>

          {/* ========================================================
              VIEW A: COLLECTION OVERVIEW / HUB VIEW
          ======================================================== */}
          {selectedArticleId === null || !currentArticle ? (
            <div className="doc-hub">
              <div className="doc-hub__header">
                <div className="doc-hub__icon-wrapper">
                  <DocIcon name={currentCollection.icon} />
                </div>
                <h1 className="doc-hub__title">{currentCollection.name}</h1>
                <p className="doc-hub__tagline">{currentCollection.tagline}</p>
                <p className="doc-hub__desc">{currentCollection.description}</p>
                <div className="doc-hub__meta">
                  <span className="doc-hub__count-badge">{currentCollection.articles.length} artikel panduan</span>
                  <span className="doc-hub__badge-verified">✓ Terverifikasi Produk v2.4</span>
                </div>
              </div>

              {/* Articles Section */}
              <div className="doc-hub__section">
                <h2 className="doc-hub__section-title">Artikel &amp; Panduan Lengkap</h2>
                <div className="doc-hub__articles-list">
                  {currentCollection.articles.map((art) => (
                    <button
                      key={art.id}
                      type="button"
                      className="doc-hub__article-row"
                      onClick={() => navigateTo(currentCollection.id, art.id)}
                    >
                      <div className="doc-hub__article-icon">
                        <DocIcon name="file-text" />
                      </div>
                      <div className="doc-hub__article-content">
                        <div className="doc-hub__article-top">
                          <span className="doc-hub__article-title">{art.title}</span>
                          {art.badge && <span className="doc-badge doc-badge--accent">{art.badge}</span>}
                          <span className="doc-hub__article-time">{art.readTime}</span>
                        </div>
                        <p className="doc-hub__article-summary">{art.summary}</p>
                      </div>
                      <div className="doc-hub__article-arrow">
                        <DocIcon name="chevron-right" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Other Collections Grid */}
              <div className="doc-hub__section">
                <h2 className="doc-hub__section-title">Eksplorasi Modul Lainnya</h2>
                <div className="doc-hub__grid">
                  {DOC_COLLECTIONS.filter((c) => c.id !== currentCollection.id).map((other) => (
                    <button
                      key={other.id}
                      type="button"
                      className="doc-hub__card"
                      onClick={() => navigateTo(other.id, null)}
                    >
                      <div className="doc-hub__card-icon">
                        <DocIcon name={other.icon} />
                      </div>
                      <h3 className="doc-hub__card-title">{other.name}</h3>
                      <p className="doc-hub__card-desc">{other.tagline}</p>
                      <div className="doc-hub__card-footer">
                        <span>{other.articles.length} artikel</span>
                        <span className="doc-hub__card-link">Lihat panduan →</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================
                VIEW B: ARTICLE READING VIEW (Claude Support Style)
            ======================================================== */
            <article className="doc-article">
              {/* Article Header */}
              <header className="doc-article__header">
                <div className="doc-article__badges">
                  <span className="doc-badge doc-badge--collection">{currentCollection.name}</span>
                  {currentArticle.badge && (
                    <span className="doc-badge doc-badge--accent">{currentArticle.badge}</span>
                  )}
                  <span className="doc-article__time">{currentArticle.readTime}</span>
                </div>
                <h1 className="doc-article__title">{currentArticle.title}</h1>
                <p className="doc-article__lead">{currentArticle.content.lead}</p>
              </header>

              <div className="doc-article__divider" />

              {/* Article Content Sections */}
              <div className="doc-article__body">
                {currentArticle.content.sections.map((section, secIdx) => (
                  <section key={secIdx} className="doc-section">
                    <h2 className="doc-section__heading">{section.heading}</h2>

                    {section.text && <p className="doc-section__text">{section.text}</p>}

                    {/* Step-by-Step Walkthrough */}
                    {section.steps && section.steps.length > 0 && (
                      <div className="doc-steps">
                        {section.steps.map((step, sIdx) => (
                          <div key={sIdx} className="doc-step-card">
                            <div className="doc-step-card__header">
                              <span className="doc-step-card__num">{sIdx + 1}</span>
                              <div className="doc-step-card__info">
                                <h3 className="doc-step-card__title">{step.title}</h3>
                                <p className="doc-step-card__desc">{step.desc}</p>
                              </div>
                            </div>

                            {step.cmd && (
                              <div className="doc-cmd-block">
                                <div className="doc-cmd-block__bar">
                                  <span className="doc-cmd-block__tag">
                                    <DocIcon name="terminal" className="doc-cmd-block__icon" />
                                    Terminal
                                  </span>
                                  <button
                                    type="button"
                                    className="doc-copy-btn"
                                    onClick={() => handleCopy(step.cmd!, `step-${secIdx}-${sIdx}`)}
                                  >
                                    <DocIcon
                                      name={copiedId === `step-${secIdx}-${sIdx}` ? "check" : "copy"}
                                      className="doc-copy-btn__icon"
                                    />
                                    <span>{copiedId === `step-${secIdx}-${sIdx}` ? "Tersalin!" : "Salin"}</span>
                                  </button>
                                </div>
                                <pre className="doc-cmd-block__pre">
                                  <code>{step.cmd}</code>
                                </pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Code Snippet Block */}
                    {section.code && (
                      <div className="doc-code-block">
                        <div className="doc-code-block__header">
                          <span className="doc-code-block__lang">{section.code.language.toUpperCase()}</span>
                          <button
                            type="button"
                            className="doc-copy-btn"
                            onClick={() => handleCopy(section.code!.content, `code-${secIdx}`)}
                          >
                            <DocIcon
                              name={copiedId === `code-${secIdx}` ? "check" : "copy"}
                              className="doc-copy-btn__icon"
                            />
                            <span>{copiedId === `code-${secIdx}` ? "Tersalin!" : "Salin Kode"}</span>
                          </button>
                        </div>
                        <pre className="doc-code-block__pre">
                          <code>{section.code.content}</code>
                        </pre>
                        {section.code.caption && (
                          <div className="doc-code-block__caption">
                            <span>Keterangan: {section.code.caption}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Formatted Data Table */}
                    {section.table && (
                      <div className="doc-table-wrap">
                        <table className="doc-table">
                          <thead>
                            <tr>
                              {section.table.headers.map((h, hIdx) => (
                                <th key={hIdx}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {section.table.rows.map((row, rIdx) => (
                              <tr key={rIdx}>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Callout / Alert Box */}
                    {section.callout && (
                      <div className={`doc-callout doc-callout--${section.callout.type}`}>
                        <div className="doc-callout__icon">
                          <DocIcon
                            name={
                              section.callout.type === "warning"
                                ? "warning"
                                : section.callout.type === "tip"
                                ? "lightbulb"
                                : "info"
                            }
                          />
                        </div>
                        <div className="doc-callout__content">
                          <span className="doc-callout__title">{section.callout.title}</span>
                          <p className="doc-callout__msg">{section.callout.message}</p>
                        </div>
                      </div>
                    )}

                    {/* Checklists / Feature Lists */}
                    {section.list && (
                      <ul className="doc-checklist">
                        {section.list.map((item, lIdx) => (
                          <li key={lIdx} className="doc-checklist__item">
                            <span className="doc-checklist__icon">
                              <DocIcon name="check" />
                            </span>
                            <span className="doc-checklist__text">{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>

              {/* Bottom Pagination Links */}
              <div className="doc-pagination">
                {prevArticle ? (
                  <button
                    type="button"
                    className="doc-pagination__btn doc-pagination__btn--prev"
                    onClick={() => navigateTo(currentCollection.id, prevArticle.id)}
                  >
                    <span className="doc-pagination__sub">← Panduan Sebelumnya</span>
                    <span className="doc-pagination__title">{prevArticle.title}</span>
                  </button>
                ) : (
                  <div />
                )}

                {nextArticle ? (
                  <button
                    type="button"
                    className="doc-pagination__btn doc-pagination__btn--next"
                    onClick={() => navigateTo(currentCollection.id, nextArticle.id)}
                  >
                    <span className="doc-pagination__sub">Panduan Selanjutnya →</span>
                    <span className="doc-pagination__title">{nextArticle.title}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="doc-pagination__btn doc-pagination__btn--next"
                    onClick={() => navigateTo(currentCollection.id, null)}
                  >
                    <span className="doc-pagination__sub">Koleksi Selesai</span>
                    <span className="doc-pagination__title">Kembali ke Ringkasan Modul</span>
                  </button>
                )}
              </div>

              {/* Feedback & Support Banner */}
              <div className="doc-feedback-banner">
                <div className="doc-feedback-banner__text">
                  <h3>Ada pertanyaan teknis atau butuh penyesuaian alur modul?</h3>
                  <p>
                    Tim teknis Entaris siap mendampingi proses deployment di infrastruktur perusahaan Anda, dari instalasi server hingga training user.
                  </p>
                </div>
                <div className="doc-feedback-banner__actions">
                  <a
                    href={`https://wa.me/${WHATSAPP_NUMBER}?text=Halo%20Tim%20Entaris,%20saya%20sedang%20membaca%20dokumentasi%20${encodeURIComponent(
                      currentArticle.title
                    )}%20dan%20ada%20pertanyaan`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="doc-btn doc-btn--whatsapp"
                  >
                    Konsultasi via WhatsApp
                  </a>
                  <Link href={DEMO_HREF} className="doc-btn doc-btn--outline">
                    Jadwalkan Live Demo
                  </Link>
                </div>
              </div>
            </article>
          )}
        </main>
      </div>

      {/* ========================================================
          3. SEARCH MODAL (CMD+K / REAL-TIME SEARCH)
      ======================================================== */}
      {isSearchOpen && (
        <div className="doc-search-modal" role="dialog" aria-modal="true" aria-label="Cari dokumentasi">
          <div className="doc-search-modal__backdrop" onClick={() => setIsSearchOpen(false)} />
          <div className="doc-search-modal__panel">
            <div className="doc-search-modal__bar">
              <DocIcon name="search" className="doc-search-modal__icon" />
              <input
                type="text"
                className="doc-search-modal__input"
                placeholder="Ketik kata kunci (misal: docker, PSAK, WAC, STT, 5.12, MCP)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="doc-search-modal__close-btn"
                onClick={() => setIsSearchOpen(false)}
                aria-label="Tutup pencarian"
              >
                <DocIcon name="x" />
              </button>
            </div>

            <div className="doc-search-modal__body">
              {searchQuery.trim() === "" ? (
                <div className="doc-search-modal__empty">
                  <p className="doc-search-modal__empty-heading">Pencarian Cepat Populer</p>
                  <div className="doc-search-modal__chips">
                    <button
                      type="button"
                      className="doc-search-chip"
                      onClick={() => setSearchQuery("Docker")}
                    >
                      🐳 Docker Compose Setup
                    </button>
                    <button
                      type="button"
                      className="doc-search-chip"
                      onClick={() => setSearchQuery("PSAK")}
                    >
                      📊 10 Laporan PSAK
                    </button>
                    <button
                      type="button"
                      className="doc-search-chip"
                      onClick={() => setSearchQuery("MCP")}
                    >
                      🤖 386 MCP Tools AIRA
                    </button>
                    <button
                      type="button"
                      className="doc-search-chip"
                      onClick={() => setSearchQuery("WAC")}
                    >
                      ⚙️ WAC &amp; Konversi Produksi
                    </button>
                    <button
                      type="button"
                      className="doc-search-chip"
                      onClick={() => setSearchQuery("Surat Jalan")}
                    >
                      📦 SJS vs Delivery Order
                    </button>
                    <button
                      type="button"
                      className="doc-search-chip"
                      onClick={() => setSearchQuery("Rekonsiliasi")}
                    >
                      🏦 Rekonsiliasi Bank
                    </button>
                  </div>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="doc-search-modal__results">
                  <div className="doc-search-modal__count">
                    Ditemukan {searchResults.length} hasil untuk &quot;{searchQuery}&quot;
                  </div>
                  {searchResults.map(({ collection, article }) => (
                    <button
                      key={`${collection.id}-${article.id}`}
                      type="button"
                      className="doc-search-result-item"
                      onClick={() => navigateTo(collection.id, article.id)}
                    >
                      <div className="doc-search-result-item__icon">
                        <DocIcon name={collection.icon} />
                      </div>
                      <div className="doc-search-result-item__info">
                        <div className="doc-search-result-item__badges">
                          <span className="doc-search-result-item__col">{collection.name}</span>
                          <span className="doc-search-result-item__time">{article.readTime}</span>
                        </div>
                        <h4 className="doc-search-result-item__title">{article.title}</h4>
                        <p className="doc-search-result-item__summary">{article.summary}</p>
                      </div>
                      <span className="doc-search-result-item__arrow">›</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="doc-search-modal__no-results">
                  <p>Tidak ditemukan artikel dengan kata kunci &quot;{searchQuery}&quot;.</p>
                  <p className="doc-search-modal__sub-no-results">
                    Coba kata kunci lain atau telusuri langsung melalui daftar modul di navigasi samping.
                  </p>
                </div>
              )}
            </div>

            <div className="doc-search-modal__footer">
              <span>Navigasi: <strong>Klik</strong> untuk membuka artikel</span>
              <span>Tekan <strong>Esc</strong> untuk menutup</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
