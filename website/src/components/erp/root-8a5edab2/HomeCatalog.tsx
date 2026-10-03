"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from "react";
import { useErpRoot } from "@/components/erp/shared/ErpRoot";
import type { CategoryView } from "@/components/erp/shared/ErpRoot";
import { toCloneHref } from "@/components/erp/shared/links";

/*
 * Home catalog (`main#main-content`) of erpai.studio — port of catalog/home-stream.js (category
 * state, history, batches, FLIP), catalog/filter-bar.js (overflow arrows, centring the current
 * filter; the home bar is never "stuck"), catalog/row-rail.js (row paging/dots/progress),
 * catalog/card-hover.js (hover transform + parallax vars) and catalog/title-fit.js.
 * The source catalog has one category and one app, so the stream data below is that snapshot.
 */

/* ----------------------------------------------------------------------------------------------
 * Data (from #home-catalog-stream-data and the filter bar's data-* attributes)
 * -------------------------------------------------------------------------------------------- */

type StreamItem = {
  name: string;
  displayName: string;
  description: string;
  categoryLabel: string;
  categorySlug: string;
  tags: readonly string[];
  features: readonly string[];
  source: string;
  searchText: string;
};

type StreamEntry = { index: number; item: StreamItem };

type CategoryTag = { slug: string; label: string; href: string; live: number; planned: number };

const STREAM: readonly StreamEntry[] = [
  {
    index: 0,
    item: {
      name: "Manufacturing ERP",
      displayName: "Manufacturing ERP",
      description:
        "Plan materials, control inventory, release production, manage quality and costs, and connect purchasing to MRP in one manufacturing ERP. The Procurement module includes a Procure-to-Pay process for requisitions, approvals, purchase orders, receipts, invoice matching, and payment authorization.",
      categoryLabel: "Manufacturing",
      categorySlug: "manufacturing",
      tags: ["manufacturing", "MRP", "production control", "inventory", "procurement", "quality", "costing"],
      features: [
        "Item and lot control",
        "BOMs and routings",
        "Demand, MPS, and MRP",
        "Production and job cards",
        "Quality and nonconformance",
        "Standard cost and WIP",
        "MRP-linked procurement",
      ],
      source: "published",
      searchText: "",
    },
  },
];

const TAGS: readonly CategoryTag[] = [
  { slug: "all", label: "All apps", href: "/catalog/", live: 1, planned: 0 },
  { slug: "manufacturing", label: "Manufacturing", href: "/catalog/manufacturing/", live: 1, planned: 0 },
];

const BATCH_SIZE = 20;
const SCROLL_STATE_SAVE_DELAY_MS = 250;
const DEFAULT_END_COPY = "All published apps in this category are shown";
const APP_DESC =
  "Plan materials, control inventory, release production, manage quality and costs, and connect purchasing to MRP in one manufacturing ERP. The Procurement module includes a Procure-to-Pay process for requisitions, approvals, purchase orders, receipts, invoice matching, and payment authorization.";

/** data-app-* attributes shared by the row card and the grid card (verbatim from the draft). */
const CARD_DATA = {
  "data-app-name": "Manufacturing ERP",
  "data-app-display": "Manufacturing ERP",
  "data-app-desc": "Plan materials, control inventory, release production, manage quality and costs, and connect purchasing to MRP in one manufacturing ERP. The Procurement module includes a Procure-to-Pay process for requisitions, approvals, purchase orders, receipts, invoice matching, and payment authorization.",
  "data-app-about": "Plan materials, control inventory, release production, manage quality and costs, and connect purchasing to MRP in one manufacturing ERP. The Procurement module includes a Procure-to-Pay process for requisitions, approvals, purchase orders, receipts, invoice matching, and payment authorization.",
  "data-app-about-category": "Manufacturing",
  "data-app-cat": "Manufacturing",
  "data-app-cat-id": "mfg",
  "data-app-cat-icon": "MFG",
  "data-app-category-slug": "manufacturing",
  "data-app-tags": "manufacturing,MRP,production control,inventory,procurement,quality,costing",
  "data-app-features": "Item and lot control,BOMs and routings,Demand, MPS, and MRP,Production and job cards,Quality and nonconformance,Standard cost and WIP,MRP-linked procurement",
  "data-app-contributors": "[{\"id\":\"6df7a2ec6126e4ea\",\"name\":\"SD\"}]",
  "data-app-slug": "manufacturing-erp",
  "data-app-identity": "manufacturing-erp",
  "data-app-pricing": "Token-based",
  "data-app-read": "3 tokens",
  "data-app-write": "12 tokens",
  "data-app-free-tier": "Included",
  "data-app-free-tier-quota": "1000",
  "data-app-agent-support": "Published",
  "data-app-agent-code": "LIVE",
  "data-app-agent-name": "ERP AI",
  "data-app-per-request": "0.003",
  "data-app-uptime": "99.9",
  "data-app-p95": "50",
  "data-app-published": "true",
  "data-app-page-url": "/manufacturing-erp",
  "data-app-installable": "false",
  "data-app-copy-status": "Exact catalog snapshot",
  "data-app-created-at": "2026-08-21T10:41:17.886Z",
  "data-app-updated-at": "2026-08-24T17:42:37.903Z",
  "data-app-installs": "0",
  "data-app-clicks": "0",
  "data-app-views": "0",
  "data-app-badge": "",
  "data-app-source": "published",
  "data-app-catalog-version": "16",
  "data-app-scene": "factory",
  "data-app-photo-source": "unsplash",
  "data-app-modal-presentation": "{\"identity\":{\"category\":\"Manufacturing\",\"title\":\"Manufacturing ERP\",\"lead\":\"Plan materials, control inventory, release production, manage quality and costs, and connect purchasing to MRP in one manufacturing ERP. The Procurement module includes a Procure-to-Pay process for requisitions, approvals, purchase orders, receipts, invoice matching, and payment authorization.\",\"tags\":[\"manufacturing\",\"MRP\",\"production control\",\"inventory\",\"procurement\",\"quality\",\"costing\"]},\"evidence\":[{\"label\":\"Tables\",\"value\":\"38\"},{\"label\":\"Configured fields\",\"value\":\"637\"},{\"label\":\"Seeded tables\",\"value\":\"38\"},{\"label\":\"Workflow\",\"value\":\"11\"},{\"label\":\"Dashboards\",\"value\":\"4\"},{\"label\":\"Suggested roles\",\"value\":\"4\"}],\"inside\":[{\"body\":\"Item and lot control is available in the publisher-maintained product.\",\"label\":\"Manufacturing\",\"title\":\"Item and lot control\"},{\"body\":\"BOMs and routings is available in the publisher-maintained product.\",\"label\":\"Manufacturing\",\"title\":\"BOMs and routings\"},{\"body\":\"Demand, MPS, and MRP is available in the publisher-maintained product.\",\"label\":\"Manufacturing\",\"title\":\"Demand, MPS, and MRP\"},{\"body\":\"Production and job cards is available in the publisher-maintained product.\",\"label\":\"Manufacturing\",\"title\":\"Production and job cards\"},{\"body\":\"Quality and nonconformance is available in the publisher-maintained product.\",\"label\":\"Manufacturing\",\"title\":\"Quality and nonconformance\"},{\"body\":\"Standard cost and WIP is available in the publisher-maintained product.\",\"label\":\"Manufacturing\",\"title\":\"Standard cost and WIP\"}],\"details\":[{\"kind\":\"cards\",\"label\":\"Built for\",\"title\":\"The teams that need this app.\",\"body\":\"Every role works in the same shared product.\",\"items\":[{\"body\":\"Run Manufacturing ERP with the tables and views needed for repeated operational work.\",\"label\":\"Operators\",\"title\":\"Daily teams\"},{\"body\":\"Track exceptions, review work, and keep the team aligned from a shared workspace.\",\"label\":\"Managers\",\"title\":\"Approvals and visibility\"},{\"body\":\"Connect supported settings, roles, integrations, and reports without changing the publisher-managed product.\",\"label\":\"Implementation\",\"title\":\"Ready to configure\"}]},{\"kind\":\"cards\",\"label\":\"Built for scale\",\"title\":\"Structured enough to grow with the team.\",\"body\":\"Start quickly without blocking the path to live operations.\",\"items\":[{\"body\":\"Use roles and workspace permissions to let different teams operate from the same app.\",\"title\":\"Multi-user by default\"},{\"body\":\"Data lives in typed tables with views, forms, references, and audit-friendly history.\",\"title\":\"Structured records\"},{\"body\":\"Workflows run against isolated workspace data while the publisher maintains the product logic.\",\"title\":\"Workflow-ready\"},{\"body\":\"Use the app through UI workflows or API surfaces as your implementation matures.\",\"title\":\"API-accessible\"}]},{\"kind\":\"records\",\"label\":\"What you get\",\"title\":\"Views, records, and workflow controls.\",\"body\":\"The public page preview uses the same structure as the published product pages.\",\"items\":[{\"title\":\"Operational dashboard\",\"body\":\"Track active work, exceptions, owners, and recent activity from the same workspace.\",\"meta\":\"\"},{\"title\":\"Core records\",\"body\":\"Work from filtered, grouped, and role-aware table views instead of static spreadsheets.\",\"meta\":\"\"},{\"title\":\"Workflow control\",\"body\":\"Use workflows to operate the supported process around your workspace data.\",\"meta\":\"\"}]},{\"kind\":\"steps\",\"label\":\"The loop\",\"title\":\"The process lives beside the data.\",\"body\":\"Activate the app, configure your workspace, and run the real business process.\",\"items\":[{\"body\":\"Add the publisher-managed product to your workspace and start using it with your organization data.\",\"label\":\"01\",\"title\":\"Activate the app\"},{\"body\":\"Start with 38 tables and the included relationships, forms, and views.\",\"label\":\"02\",\"title\":\"Review the schema\"},{\"body\":\"Set workspace roles, permissions, and supported workflow options for the process you run.\",\"label\":\"03\",\"title\":\"Configure the workflow\"},{\"body\":\"Bring users into the workspace and operate from the same app instead of a disconnected spreadsheet stack.\",\"label\":\"04\",\"title\":\"Invite the team\"}]},{\"kind\":\"records\",\"label\":\"AI and operators\",\"title\":\"Assistants that work inside the app.\",\"body\":\"Use AI as an operating layer over the same records your team uses.\",\"items\":[{\"title\":\"Data steward\",\"body\":\"Checks incomplete records, highlights stale work, and keeps the app ready for action.\",\"meta\":\"\"},{\"title\":\"Workflow runner\",\"body\":\"Uses workflows and app data to move routine steps forward with an audit trail.\",\"meta\":\"\"},{\"title\":\"Reporting helper\",\"body\":\"Turns operational data into summaries that managers can review without exporting the app.\",\"meta\":\"\"}]},{\"kind\":\"comparison\",\"label\":\"Compared\",\"title\":\"Blank setup vs a published app.\",\"body\":\"Start from a working system instead of a blank canvas.\",\"beforeLabel\":\"Before\",\"afterLabel\":\"Published app\",\"items\":[{\"title\":\"Go-live\",\"before\":\"Blank app, spreadsheet import, and manual setup.\",\"after\":\"Publisher-maintained app with schema, views, forms, and defaults.\"},{\"title\":\"Workflow\",\"before\":\"Process lives outside the system.\",\"after\":\"Workflows can run beside the records they operate on.\"},{\"title\":\"Iteration\",\"before\":\"Changes require rebuilding the system from scratch.\",\"after\":\"Configure workspace settings, roles, permissions, and supported workflow controls.\"},{\"title\":\"Access\",\"before\":\"Shared credentials or duplicated sheets.\",\"after\":\"Workspace users, roles, and app-level permissions.\"}]},{\"kind\":\"steps\",\"label\":\"Time to value\",\"title\":\"Activate, configure, operate, scale.\",\"body\":\"A practical rollout path from first click to real team usage.\",\"items\":[{\"title\":\"Activate\",\"body\":\"Start using the app, review the included process, and add the first workspace records.\",\"meta\":\"Day 1\"},{\"title\":\"Configure\",\"body\":\"Set roles, workspace options, and the first supported integration or workflow.\",\"meta\":\"Week 1\"},{\"title\":\"Operate\",\"body\":\"Move real work through the app and refine reports from day-to-day usage.\",\"meta\":\"Month 1\"},{\"title\":\"Scale\",\"body\":\"Invite more teams, connect APIs, and standardize the operating model.\",\"meta\":\"Quarter 1\"}]},{\"kind\":\"cards\",\"label\":\"Technical proof\",\"title\":\"Workspace-safe by design.\",\"body\":\"The publisher maintains the product while your workspace data stays isolated.\",\"items\":[{\"body\":\"The publisher maintains the app and releases improvements without handing over the base product.\",\"title\":\"Publisher-owned product\"},{\"body\":\"Your records, access settings, and activity stay isolated and tied to your workspace history.\",\"title\":\"Workspace data isolation\"},{\"body\":\"Connect approved APIs, workflows, reports, and screens through product-supported extension points.\",\"title\":\"Governed extension path\"}]},{\"kind\":\"faq\",\"label\":\"FAQ\",\"title\":\"Common questions.\",\"body\":\"\",\"items\":[{\"title\":\"What do I get when I activate Manufacturing ERP?\",\"body\":\"The app becomes available to your workspace with its supported schema, views, forms, workflows, and configured starting data. Your organization uses the shared product with its own access and records.\"},{\"title\":\"Who owns and maintains the app?\",\"body\":\"The publisher owns and maintains the base app. Your organization controls its workspace data, users, roles, and available settings.\"}]}],\"operations\":{\"installStrategy\":\"none\",\"contributors\":[{\"id\":\"6df7a2ec6126e4ea\",\"name\":\"SD\"}],\"updatedAt\":\"2026-08-24T17:42:37.903Z\"},\"relatedApps\":[]}",
} as const;

const ROW_CARD_STYLE = {
  order: "0",
  "--card-bg": "oklch(55% 0.03 60)",
  "--card-fg": "#fff",
  "--card-bg-d": "oklch(45% 0.03 60)",
  "--card-fg-d": "#f0ece4",
  "--catalog-card-index": "0",
  "--title-fs": "29px",
} as CSSProperties;
const GRID_CARD_STYLE = { "--catalog-card-index": "0", "--title-fs": "-47px" } as CSSProperties;
const ROW_HEADER_STYLE = { "--row-accent": "var(--cat-mfg, var(--cat-default))" } as CSSProperties;
const ROW_COUNT_STYLE = { "--home-results-accent": "var(--row-accent)" } as CSSProperties;
const BG_STYLE: CSSProperties = { background: "var(--background)" };
const ICON_14: CSSProperties = { width: "14px", height: "14px", color: "var(--text-m)" };
const ICON_16: CSSProperties = { width: "16px", height: "16px" };
const ICON_64: CSSProperties = { width: "64px", height: "64px" };

/* ----------------------------------------------------------------------------------------------
 * Pure helpers
 * -------------------------------------------------------------------------------------------- */

type Snapshot = { entryId: string; filter: string; loaded: number; focusKey: string; scrollY: number };
type HistoryState = Record<string, unknown> & { homeCatalog?: Partial<Snapshot> };

function historyState(): HistoryState {
  const state: unknown = window.history.state;
  return state && typeof state === "object" ? (state as HistoryState) : {};
}

function homeState(): Partial<Snapshot> | null {
  return historyState().homeCatalog ?? null;
}

function tagFor(filter: string): CategoryTag {
  return TAGS.find((t) => t.slug === filter) ?? TAGS[0];
}

function filterFromUrl(): string {
  const requested = new URL(window.location.href).searchParams.get("category") || "all";
  return TAGS.some((t) => t.slug === requested) ? requested : "all";
}

function queryFromUrl(): string {
  return (new URL(window.location.href).searchParams.get("s") || "").trim();
}

function matchingNodes(filter: string, query: string): StreamEntry[] {
  return STREAM.filter((node) => {
    if (filter !== "all" && node.item.categorySlug !== filter) return false;
    if (!query) return true;
    const item = node.item;
    const haystack = [
      item.displayName,
      item.name,
      item.description,
      item.categoryLabel,
      item.categorySlug,
      ...item.tags,
      ...item.features,
      item.searchText,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.indexOf(query.toLowerCase()) >= 0;
  });
}

type Counts = { live: number; planned: number; total: number };

function countsForNodes(nodes: StreamEntry[]): Counts {
  return nodes.reduce<Counts>(
    (c, node) =>
      node.item.source === "published"
        ? { live: c.live + 1, planned: c.planned, total: c.total + 1 }
        : { live: c.live, planned: c.planned + 1, total: c.total + 1 },
    { live: 0, planned: 0, total: 0 },
  );
}

function tagCounts(filter: string): Counts {
  const tag = tagFor(filter);
  return { live: tag.live, planned: tag.planned, total: tag.live + tag.planned };
}

function categoryUrl(filter: string): string {
  const url = new URL(window.location.href);
  url.searchParams.delete("app");
  url.searchParams.delete("app_source");
  url.searchParams.delete("s");
  if (filter === "all") url.searchParams.delete("category");
  else url.searchParams.set("category", filter);
  url.hash = "";
  return url.pathname + url.search;
}

function cardIdentity(card: HTMLElement): string {
  const d = card.dataset;
  return `${d.appSource || "registry"}:${d.appIdentity || d.appSlug || d.appName || ""}`;
}

/** title-fit.js `fit()`; the measurer lives under the root so `--font-heading` resolves. */
function fitTitles(catalogEl: HTMLElement, host: HTMLElement) {
  const titles = catalogEl.querySelectorAll<HTMLElement>(".catalog-card__title");
  if (!titles.length) return;
  type Item = { el: HTMLElement; parent: HTMLElement; words: string[]; longest: string; maxW: number; maxH: number };
  const items: Item[] = [];
  titles.forEach((el) => {
    const parent = el.closest<HTMLElement>(".catalog-card");
    if (!parent) return;
    const words = (el.textContent || "").trim().split(/\s+/);
    const longest = words.reduce((a, b) => (a.length >= b.length ? a : b));
    items.push({ el, parent, words, longest, maxW: parent.offsetWidth - 32, maxH: parent.offsetHeight });
  });
  if (!items.length) return;

  const measurer = document.createElement("span");
  measurer.style.cssText =
    "position:absolute;visibility:hidden;white-space:nowrap;" +
    "font-family:var(--font-heading);font-weight:900;text-transform:uppercase;";
  host.appendChild(measurer);
  const widthFit = new Map<string, number>();
  const minFs = 17;
  const maxFs = window.innerWidth < 640 ? 34 : 38;
  const writes = items.map((it) => {
    const key = `${it.longest}|${it.maxW}`;
    let bestForWidth = widthFit.get(key);
    if (bestForWidth === undefined) {
      measurer.textContent = it.longest;
      let lo = minFs;
      let hi = maxFs;
      bestForWidth = lo;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        measurer.style.fontSize = `${mid}px`;
        if (measurer.offsetWidth <= it.maxW) {
          bestForWidth = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      widthFit.set(key, bestForWidth);
    }
    let best = bestForWidth;
    if (it.words.length > 1) {
      const heightCap = Math.floor((it.maxH - 80) / (it.words.length * 0.86));
      if (heightCap < best) best = heightCap;
    }
    return { it, fs: best };
  });
  host.removeChild(measurer);
  writes.forEach(({ it, fs }) => {
    it.parent.style.setProperty("--title-fs", `${fs}px`);
    it.el.style.fontSize = "";
  });
}

/* ----------------------------------------------------------------------------------------------
 * Hooks
 * -------------------------------------------------------------------------------------------- */

type Arrows = { overflow: boolean; left: boolean; right: boolean };
const NO_ARROWS: Arrows = { overflow: false, left: false, right: false };

/** filter-bar.js for the home bar: overflow arrows + centring the current filter. */
function useFilterBar(trackRef: RefObject<HTMLDivElement | null>) {
  const [arrows, setArrows] = useState<Arrows>(NO_ARROWS);
  const alignRef = useRef<() => void>(() => {});

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    let disposed = false;
    const update = () => {
      const overflow = track.scrollWidth > track.clientWidth + 1;
      const atLeft = track.scrollLeft <= 1;
      const atRight = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
      const next = { overflow, left: overflow && !atLeft, right: overflow && !atRight };
      setArrows((prev) =>
        prev.overflow === next.overflow && prev.left === next.left && prev.right === next.right ? prev : next,
      );
    };
    const center = () => {
      if (!track.isConnected) return;
      const current = track.querySelector<HTMLElement>('[aria-current="page"]');
      if (!current) return;
      const trackRect = track.getBoundingClientRect();
      const rect = current.getBoundingClientRect();
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const centered = track.scrollLeft + (rect.left + rect.width / 2 - (trackRect.left + trackRect.width / 2));
      track.scrollTo({ left: Math.min(maxScroll, Math.max(0, centered)), behavior: "auto" });
      update();
    };
    const align = () => {
      if (frame) cancelAnimationFrame(frame);
      center();
      frame = requestAnimationFrame(() => {
        frame = 0;
        center();
      });
    };
    alignRef.current = align;
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const boot = requestAnimationFrame(() => {
      align();
      update();
    });
    document.fonts?.ready.then(() => {
      if (!disposed) align();
    });
    return () => {
      disposed = true;
      alignRef.current = () => {};
      cancelAnimationFrame(boot);
      if (frame) cancelAnimationFrame(frame);
      track.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [trackRef]);

  const scrollBy = useCallback(
    (dir: -1 | 1) => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      trackRef.current?.scrollBy({ left: dir * 200, behavior: reduce ? "auto" : "smooth" });
    },
    [trackRef],
  );

  return { arrows, alignRef, scrollBy };
}

type Rail = {
  pages: number;
  dotsVisible: boolean;
  active: number;
  leftShown: boolean;
  rightShown: boolean;
  headerLeftDisabled: boolean;
  headerRightDisabled: boolean;
  progressHidden: boolean;
  thumbWidth: number;
  thumbLeft: number;
};
const INITIAL_RAIL: Rail = {
  pages: 0,
  dotsVisible: false,
  active: 0,
  leftShown: false,
  rightShown: false,
  headerLeftDisabled: true,
  headerRightDisabled: true,
  progressHidden: true,
  thumbWidth: 100,
  thumbLeft: 0,
};

function sameRail(a: Rail, b: Rail): boolean {
  return (Object.keys(a) as (keyof Rail)[]).every((k) => a[k] === b[k]);
}

/** row-rail.js for one row: dots, inline/header scroll buttons, progress thumb. */
function useRowRail(trackRef: RefObject<HTMLDivElement | null>) {
  const [rail, setRail] = useState<Rail>(INITIAL_RAIL);
  const apiRef = useRef<{ toPage: (n: number) => void; prev: () => void; next: () => void } | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scrollFrame = 0;
    const maxScrollLeft = () => Math.max(0, track.scrollWidth - track.clientWidth);
    const visibleCards = () =>
      Array.from(track.children)
        .map((child, index) => ({ child: child as HTMLElement, index }))
        .filter(({ child }) => child.classList.contains("catalog-card") && child.style.display !== "none")
        .sort((a, b) => {
          const oa = Number.parseInt(getComputedStyle(a.child).order, 10) || 0;
          const ob = Number.parseInt(getComputedStyle(b.child).order, 10) || 0;
          return oa - ob || a.index - b.index;
        })
        .map(({ child }) => child);
    const measuredStep = () => {
      const cards = visibleCards();
      const first = cards[0];
      if (!first) return track.clientWidth || 1;
      const next = (track.dataset.catalogLayout || "default") === "mixed" ? cards[2] : cards[1];
      if (next) return Math.max(1, next.getBoundingClientRect().left - first.getBoundingClientRect().left);
      return Math.max(1, first.getBoundingClientRect().width);
    };
    const totalPages = () => {
      const count = visibleCards().length || 1;
      return Math.max(1, Math.min(count, Math.ceil(maxScrollLeft() / measuredStep()) + 1));
    };
    const currentPage = () => {
      const max = maxScrollLeft();
      if (max && track.scrollLeft >= max - 1) return totalPages() - 1;
      return Math.min(totalPages() - 1, Math.round(track.scrollLeft / measuredStep()));
    };
    const toPage = (n: number) => {
      const target = Math.min(maxScrollLeft(), Math.max(0, n * measuredStep()));
      track.scrollTo({ left: target, behavior: reduced ? "auto" : "smooth" });
    };
    const measure = (): Rail => {
      const atStart = track.scrollLeft <= 8;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
      const max = maxScrollLeft();
      const onePage = max <= 8;
      const progress = max ? Math.min(1, Math.max(0, track.scrollLeft / max)) : 0;
      const thumbWidth = track.scrollWidth
        ? Math.min(100, Math.max(18, (track.clientWidth / track.scrollWidth) * 100))
        : 100;
      const pages = track.clientWidth ? totalPages() : 0;
      return {
        pages: pages > 1 ? pages : 0,
        dotsVisible: pages > 1,
        active: currentPage(),
        leftShown: !atStart,
        rightShown: !atEnd,
        headerLeftDisabled: onePage || atStart,
        headerRightDisabled: onePage || atEnd,
        progressHidden: onePage,
        thumbWidth,
        thumbLeft: progress * (100 - thumbWidth),
      };
    };
    const rebuild = () => {
      const next = measure();
      setRail((prev) => (sameRail(prev, next) ? prev : next));
    };
    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        rebuild();
      });
    };
    apiRef.current = {
      toPage,
      prev: () => toPage(Math.max(0, currentPage() - 1)),
      next: () => toPage(Math.min(totalPages() - 1, currentPage() + 1)),
    };
    const boot = requestAnimationFrame(rebuild);
    const ro = new ResizeObserver(rebuild);
    ro.observe(track);
    track.addEventListener("scroll", onScroll, { passive: true });
    track.addEventListener("load", rebuild, true);
    return () => {
      apiRef.current = null;
      cancelAnimationFrame(boot);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      ro.disconnect();
      track.removeEventListener("scroll", onScroll);
      track.removeEventListener("load", rebuild, true);
    };
  }, [trackRef]);

  return { rail, apiRef };
}

/** card-hover.js — classes and CSS variables written on the hovered card / its row. */
function useCardHover(catalogRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const catalogEl = catalogRef.current;
    if (!catalogEl) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hoverQuery = window.matchMedia("(pointer: fine) and (min-width: 768px)");
    const HOVER_VARS = [
      "--catalog-hover-transform",
      "--catalog-image-y-comp",
      "--catalog-content-x-comp",
      "--catalog-arrow-x-comp",
      "--catalog-arrow-y-comp",
      "--catalog-parallax-x",
      "--catalog-parallax-y",
    ];
    let hovered: HTMLElement | null = null;
    let hoveredRow: Element | null = null;
    let afterRow: Element | null = null;
    let parallaxFrame = 0;
    let pointer: { x: number; y: number } | null = null;

    const modalOpen = () => document.documentElement.classList.contains("catalog-modal-open");
    const enabled = () => !reducedMotion && hoverQuery.matches && !modalOpen();
    const clipBounds = (card: HTMLElement) => {
      let left = 0;
      let right = window.innerWidth;
      let el = card.parentElement;
      while (el && el !== document.body) {
        const ox = window.getComputedStyle(el).overflowX;
        if (ox === "hidden" || ox === "clip" || ox === "scroll" || ox === "auto") {
          const r = el.getBoundingClientRect();
          left = Math.max(left, r.left);
          right = Math.min(right, r.right);
        }
        el = el.parentElement;
      }
      return { left, right };
    };
    const cancelParallax = () => {
      pointer = null;
      if (parallaxFrame) cancelAnimationFrame(parallaxFrame);
      parallaxFrame = 0;
    };
    const syncTitleWrap = (card: HTMLElement) => {
      const title = card.querySelector(".catalog-card-overlay-title");
      if (!title) return;
      card.classList.remove("catalog-card--hover-title-multiline");
      requestAnimationFrame(() => {
        if (hovered !== card || !card.isConnected) return;
        const range = document.createRange();
        range.selectNodeContents(title);
        const tops: number[] = [];
        Array.from(range.getClientRects()).forEach((r) => {
          if (r.width && r.height && !tops.some((t) => Math.abs(t - r.top) < 1)) tops.push(r.top);
        });
        card.classList.toggle("catalog-card--hover-title-multiline", tops.length > 1);
        range.detach();
      });
    };
    const clearHover = (card: HTMLElement) => {
      if (hovered === card) cancelParallax();
      card.classList.remove("catalog-card--hovered", "catalog-card--hover-title-multiline");
      HOVER_VARS.forEach((v) => card.style.removeProperty(v));
      card.closest(".catalog-track-wrap")?.classList.remove("catalog-track-wrap--card-hovered");
      hoveredRow?.classList.remove("catalog-row--card-hovered");
      afterRow?.classList.remove("catalog-row--after-card-hover");
      hoveredRow = null;
      afterRow = null;
      if (hovered === card) hovered = null;
    };
    const clearAll = () => {
      cancelParallax();
      if (hovered) clearHover(hovered);
      catalogEl.querySelectorAll<HTMLElement>(".catalog-card--hovered").forEach(clearHover);
      catalogEl
        .querySelectorAll(".catalog-track-wrap--card-hovered")
        .forEach((w) => w.classList.remove("catalog-track-wrap--card-hovered"));
      catalogEl.querySelectorAll(".catalog-row--card-hovered").forEach((r) => r.classList.remove("catalog-row--card-hovered"));
      catalogEl
        .querySelectorAll(".catalog-row--after-card-hover")
        .forEach((r) => r.classList.remove("catalog-row--after-card-hover"));
      hovered = null;
      hoveredRow = null;
      afterRow = null;
    };
    const setHover = (card: HTMLElement) => {
      if (!enabled()) return;
      if (hovered && hovered !== card) clearHover(hovered);
      hovered = card;
      const rect = card.getBoundingClientRect();
      const scale = card.classList.contains("catalog-card--portrait") ? { x: 1.3, y: 1.06 } : { x: 1.4, y: 1.08 };
      const bounds = clipBounds(card);
      const halfW = (rect.width * (scale.x - 1)) / 2;
      let dx = 0;
      if (rect.left - halfW < bounds.left) dx = bounds.left - (rect.left - halfW);
      else if (rect.right + halfW > bounds.right) dx = bounds.right - (rect.right + halfW);
      card.classList.add("catalog-card--hovered");
      card.classList.remove("catalog-card--hover-title-multiline");
      card.style.setProperty(
        "--catalog-hover-transform",
        `translateX(${dx.toFixed(3)}px) translateY(0px) scaleX(${scale.x}) scaleY(${scale.y})`,
      );
      card.style.setProperty("--catalog-image-y-comp", (scale.x / scale.y).toFixed(4));
      card.style.setProperty("--catalog-content-x-comp", (scale.y / scale.x).toFixed(4));
      card.style.setProperty("--catalog-arrow-x-comp", (1 / scale.x).toFixed(4));
      card.style.setProperty("--catalog-arrow-y-comp", (1 / scale.y).toFixed(4));
      syncTitleWrap(card);
      card.closest(".catalog-track-wrap")?.classList.add("catalog-track-wrap--card-hovered");
      const row = card.closest(".catalog-row");
      if (row) {
        hoveredRow = row;
        afterRow = row.nextElementSibling;
        row.classList.add("catalog-row--card-hovered");
        if (afterRow?.classList.contains("catalog-row")) afterRow.classList.add("catalog-row--after-card-hover");
      }
    };
    const flushParallax = () => {
      parallaxFrame = 0;
      const p = pointer;
      pointer = null;
      const card = hovered;
      if (!p || !card || !enabled()) return;
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      card.style.setProperty("--catalog-parallax-x", `${(((p.x - rect.left) / rect.width - 0.5) * -20).toFixed(1)}px`);
      card.style.setProperty("--catalog-parallax-y", `${(((p.y - rect.top) / rect.height - 0.5) * -20).toFixed(1)}px`);
    };
    const cardOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>(".catalog-card") : null;
    const inside = (card: HTMLElement, related: EventTarget | null) => related instanceof Node && card.contains(related);

    const onOver = (e: PointerEvent) => {
      if (modalOpen()) return clearAll();
      if (e.target instanceof Element && e.target.closest(".catalog-inline-scroll")) return clearAll();
      const card = cardOf(e.target);
      if (!card || !catalogEl.contains(card) || inside(card, e.relatedTarget)) return;
      setHover(card);
    };
    const onMove = (e: PointerEvent) => {
      if (modalOpen()) return clearAll();
      if (!hovered || !enabled()) return;
      pointer = { x: e.clientX, y: e.clientY };
      if (!parallaxFrame) parallaxFrame = requestAnimationFrame(flushParallax);
    };
    const onOut = (e: PointerEvent) => {
      if (modalOpen()) return clearAll();
      const card = cardOf(e.target);
      if (!card || inside(card, e.relatedTarget)) return;
      clearHover(card);
    };
    const onResize = () => {
      if (modalOpen()) return clearAll();
      if (hovered) setHover(hovered);
    };
    const onQuery = () => {
      if (!enabled() && hovered) clearHover(hovered);
    };
    const inlineButtons = Array.from(catalogEl.querySelectorAll(".catalog-inline-scroll"));
    catalogEl.addEventListener("pointerover", onOver);
    catalogEl.addEventListener("pointermove", onMove);
    catalogEl.addEventListener("pointerout", onOut);
    window.addEventListener("resize", onResize);
    hoverQuery.addEventListener("change", onQuery);
    inlineButtons.forEach((b) => {
      b.addEventListener("pointerenter", clearAll);
      b.addEventListener("focus", clearAll);
    });
    return () => {
      clearAll();
      catalogEl.removeEventListener("pointerover", onOver);
      catalogEl.removeEventListener("pointermove", onMove);
      catalogEl.removeEventListener("pointerout", onOut);
      window.removeEventListener("resize", onResize);
      hoverQuery.removeEventListener("change", onQuery);
      inlineButtons.forEach((b) => {
        b.removeEventListener("pointerenter", clearAll);
        b.removeEventListener("focus", clearAll);
      });
    };
  }, [catalogRef]);
}

/** title-fit.js `init()`: idle fit + debounced refit on resize. */
function useTitleFit(catalogRef: RefObject<HTMLElement | null>, hostRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const catalogEl = catalogRef.current;
    if (!catalogEl) return;
    const run = () => fitTitles(catalogEl, hostRef.current ?? catalogEl);
    let idle = 0;
    let fallback = 0;
    let resizeTimer = 0;
    if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(run);
    else fallback = window.setTimeout(run, 100);
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(run, 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      if (idle) window.cancelIdleCallback(idle);
      window.clearTimeout(fallback);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    };
  }, [catalogRef, hostRef]);
}

/* ----------------------------------------------------------------------------------------------
 * home-stream.js
 * -------------------------------------------------------------------------------------------- */

type Results = {
  heading: string;
  linkHref: string;
  linkHidden: boolean;
  linkAriaLabel: string | null;
  accent: string | null;
  liveCount: number;
  liveHidden: boolean;
  progress: string;
  loadMoreHidden: boolean;
  loadMoreText: string;
  backHidden: boolean;
  endHidden: boolean;
  endCopy: string;
  showAllHidden: boolean;
  sentinelHidden: boolean;
};

/** Server-rendered state of the (hidden) selected view, as in the draft. */
const SSR_RESULTS: Results = {
  heading: "All apps",
  linkHref: "/catalog/",
  linkHidden: false,
  linkAriaLabel: "Open category catalog page",
  accent: null,
  liveCount: 1,
  liveHidden: false,
  progress: "Showing 1 of 1",
  loadMoreHidden: false,
  loadMoreText: "Load 20 more",
  backHidden: true,
  endHidden: true,
  endCopy: DEFAULT_END_COPY,
  showAllHidden: false,
  sentinelHidden: false,
};

function resultsFor(filter: string, query: string, counts: Counts, shown: number, accent: string, prev: Results): Results {
  const isAll = filter === "all";
  const tag = tagFor(filter);
  const label = query ? `Search results for “${query}”` : isAll ? "All apps" : tag.label;
  const countLabel = [counts.live > 0 ? `${counts.live} live` : "", counts.planned > 0 ? `${counts.planned} planned` : ""]
    .filter(Boolean)
    .join(", ");
  const complete = shown >= counts.total;
  const emptyQuery = counts.total === 0 && Boolean(query);
  return {
    heading: label,
    linkHref: isAll ? "/catalog/" : tag.href,
    linkHidden: isAll || Boolean(query),
    linkAriaLabel: isAll ? null : `Browse ${label}: ${countLabel}`,
    accent: isAll ? null : accent || prev.accent,
    liveCount: counts.live,
    liveHidden: counts.live <= 0,
    progress: `Showing ${shown} of ${counts.total}`,
    loadMoreHidden: complete,
    loadMoreText: `Load ${Math.min(BATCH_SIZE, counts.total - shown)} more`,
    backHidden: shown < BATCH_SIZE * 3,
    endHidden: !complete,
    endCopy: emptyQuery ? `No apps matched “${query}”. Try another search.` : DEFAULT_END_COPY,
    showAllHidden: filter === "all" && !query,
    sentinelHidden: complete,
  };
}

type RenderOpts = {
  animate?: boolean;
  reveal?: boolean;
  keyboard?: boolean;
  restoreFocus?: boolean;
  preserveHistory?: boolean;
};

type StreamApi = {
  selectCategory: (filter: string, keyboard: boolean) => void;
  showAll: (keyboard: boolean) => void;
  loadMore: () => void;
};

type StreamRefs = {
  catalogRef: RefObject<HTMLElement | null>;
  hostRef: RefObject<HTMLElement | null>;
  filterBarRef: RefObject<HTMLDivElement | null>;
  filterTrackRef: RefObject<HTMLDivElement | null>;
  gridRef: RefObject<HTMLDivElement | null>;
  headingRef: RefObject<HTMLHeadingElement | null>;
  rowTitleRef: RefObject<HTMLHeadingElement | null>;
  sentinelRef: RefObject<HTMLDivElement | null>;
  loadMoreRef: RefObject<HTMLButtonElement | null>;
  alignRef: RefObject<() => void>;
};

function useHomeStream(refs: StreamRefs, setCategoryView: (view: CategoryView) => void) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [view, setView] = useState({ allHidden: false, selectedHidden: true });
  const [results, setResults] = useState<Results>(SSR_RESULTS);
  const [shown, setShown] = useState<readonly number[] | null>(null);
  const [primed, setPrimed] = useState<Readonly<Record<number, "high" | "auto">>>({});
  const [announcement, setAnnouncement] = useState("All categories.");
  const [, setTick] = useState(0);
  const jobsRef = useRef<(() => void)[]>([]);
  const apiRef = useRef<StreamApi | null>(null);

  // Work that needs the committed DOM (the source runs it synchronously after its DOM writes).
  useEffect(() => {
    const jobs = jobsRef.current.splice(0);
    jobs.forEach((job) => job());
  });

  useEffect(() => {
    const catalogEl = refs.catalogRef.current;
    const grid = refs.gridRef.current;
    if (!catalogEl || !grid) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const initialSaved = homeState();
    let entrySequence = 0;
    const createEntryId = () => {
      entrySequence += 1;
      return `home-${Date.now().toString(36)}-${entrySequence}`;
    };
    let currentFilter = filterFromUrl();
    let currentQuery = queryFromUrl();
    let currentEntryId = initialSaved?.entryId || createEntryId();
    let focusedKey = initialSaved?.focusKey || "";
    let loadedCount =
      initialSaved && initialSaved.filter === currentFilter && Number(initialSaved.loaded) > 0
        ? Number(initialSaved.loaded)
        : BATCH_SIZE;
    let settleFrame = 0;
    let renderVersion = 0;
    let scrollSaveTimer = 0;
    let scrollStateDirty = false;
    let restoringHistory = false;
    let historyRestoreTimer = 0;
    let historyRestoreVersion = 0;
    let boundaryFrame = 0;
    const frames = new Set<number>();
    const activeAnimations = new Set<Animation>();
    const entrySnapshots = new Map<string, Snapshot>();

    const raf = (fn: () => void) => {
      const id = requestAnimationFrame(() => {
        frames.delete(id);
        fn();
      });
      frames.add(id);
      return id;
    };
    const commit = (job: () => void) => {
      jobsRef.current.push(job);
      setTick((t) => t + 1);
    };

    if (initialSaved && !initialSaved.entryId) {
      window.history.replaceState(
        { ...historyState(), homeCatalog: { ...initialSaved, entryId: currentEntryId } },
        "",
        window.location.href,
      );
    }
    if (initialSaved) {
      entrySnapshots.set(currentEntryId, {
        filter: currentFilter,
        loaded: loadedCount,
        focusKey: focusedKey,
        scrollY: Number(initialSaved.scrollY) || 0,
        ...initialSaved,
        entryId: currentEntryId,
      });
    }

    // load-boundary.js
    const hasReachedBoundary = () => {
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      const docH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
      return docH > 0 && window.scrollY + vh >= docH * 0.85;
    };
    const canLoad = () => catalogEl.isConnected && !!refs.sentinelRef.current && !refs.sentinelRef.current.hidden;
    const scheduleBoundary = () => {
      if (boundaryFrame || !canLoad()) return;
      boundaryFrame = requestAnimationFrame(() => {
        boundaryFrame = 0;
        if (!canLoad() || document.activeElement === refs.loadMoreRef.current || !hasReachedBoundary()) return;
        loadMore();
      });
    };

    const visibleCards = () => Array.from(grid.querySelectorAll<HTMLElement>(":scope > .catalog-card:not([hidden])"));
    const captureRects = (cards: HTMLElement[]) => new Map(cards.map((c) => [cardIdentity(c), c.getBoundingClientRect()]));

    const cancelMotion = () => {
      if (settleFrame) cancelAnimationFrame(settleFrame);
      settleFrame = 0;
      activeAnimations.forEach((a) => a.cancel());
      activeAnimations.clear();
      grid
        .querySelectorAll(".home-catalog-card--animating")
        .forEach((c) => c.classList.remove("home-catalog-card--animating"));
    };
    const trackAnimation = (card: HTMLElement, animation: Animation) => {
      activeAnimations.add(animation);
      card.classList.add("home-catalog-card--animating");
      animation.finished
        .catch(() => undefined)
        .finally(() => {
          activeAnimations.delete(animation);
          animation.cancel();
          card.classList.remove("home-catalog-card--animating");
        });
    };
    const animateSettledCards = (oldRects: Map<string, DOMRect>, version: number) => {
      if (version !== renderVersion || reducedMotion.matches) return;
      visibleCards().forEach((card, index) => {
        const previous = oldRects.get(cardIdentity(card));
        const next = card.getBoundingClientRect();
        const keyframes: Keyframe[] = previous
          ? [
              { transform: `translate3d(${previous.left - next.left}px, ${previous.top - next.top}px, 0)`, opacity: 1 },
              { transform: "translate3d(0, 0, 0)", opacity: 1 },
            ]
          : [
              { transform: "translate3d(0, 8px, 0) scale(0.99)", opacity: 1 },
              { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
            ];
        trackAnimation(
          card,
          card.animate(keyframes, {
            duration: 280,
            delay: Math.min((index % 5) * 24, 96),
            easing: "cubic-bezier(0.25, 1, 0.5, 1)",
            fill: "both",
          }),
        );
      });
    };

    const currentSnapshot = (scrollY: number): Snapshot => ({
      entryId: currentEntryId,
      filter: currentFilter,
      loaded: loadedCount,
      focusKey: focusedKey,
      scrollY,
    });
    const persistState = (mode: "push" | "replace") => {
      const snapshot = currentSnapshot(window.scrollY);
      entrySnapshots.set(currentEntryId, snapshot);
      const state = { ...historyState(), homeCatalog: snapshot };
      if (mode === "push") window.history.pushState(state, "", window.location.href);
      else window.history.replaceState(state, "", window.location.href);
    };
    const cancelScrollSave = () => {
      if (!scrollSaveTimer) return;
      window.clearTimeout(scrollSaveTimer);
      scrollSaveTimer = 0;
    };
    const flushScrollState = () => {
      cancelScrollSave();
      if (!scrollStateDirty || restoringHistory) return;
      scrollStateDirty = false;
      if (homeState()?.entryId !== currentEntryId) return;
      persistState("replace");
    };
    const scheduleScrollSave = () => {
      scrollStateDirty = true;
      cancelScrollSave();
      scrollSaveTimer = window.setTimeout(() => {
        scrollSaveTimer = 0;
        flushScrollState();
      }, SCROLL_STATE_SAVE_DELAY_MS);
    };

    const restoreFocus = () => {
      const key = homeState()?.focusKey || "";
      if (!key) return;
      visibleCards()
        .find((c) => cardIdentity(c) === key)
        ?.focus({ preventScroll: true });
    };
    const revealViewStart = (filter: string, keyboard: boolean) => {
      const focusTarget = filter === "all" ? refs.rowTitleRef.current || refs.headingRef.current : refs.headingRef.current;
      if (!focusTarget) return;
      const scrollTarget = refs.filterBarRef.current || focusTarget;
      const rect = scrollTarget.getBoundingClientRect();
      const margin = parseFloat(window.getComputedStyle(focusTarget).scrollMarginTop) || 0;
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - margin),
        left: window.scrollX,
        behavior: reducedMotion.matches || keyboard ? "instant" : "smooth",
      });
      if (keyboard) focusTarget.focus({ preventScroll: true });
    };
    const stopProgrammaticScroll = () => {
      window.scrollTo({ top: window.scrollY, left: window.scrollX, behavior: "instant" });
    };
    const applyView = (selected: boolean) => {
      setView({ allHidden: selected, selectedHidden: !selected });
      setCategoryView(selected ? "selected" : "all");
    };
    const readAccent = (filter: string) => {
      const tagEl = Array.from(catalogEl.querySelectorAll<HTMLElement>("[data-home-category-tag]")).find(
        (el) => (el.dataset.homeCategory || "all") === filter,
      );
      return tagEl ? window.getComputedStyle(tagEl).getPropertyValue("--home-category-accent").trim() : "";
    };

    const render = (filter: string, requested: number, opts: RenderOpts = {}) => {
      cancelMotion();
      renderVersion += 1;
      const version = renderVersion;

      if (filter === "all" && !currentQuery) {
        currentFilter = "all";
        loadedCount = BATCH_SIZE;
        setActiveFilter("all");
        applyView(false);
        if (!opts.preserveHistory) persistState("replace");
        setAnnouncement("All categories.");
        commit(() => {
          refs.alignRef.current();
          if (opts.reveal) {
            raf(() => {
              if (version !== renderVersion || !catalogEl.isConnected) return;
              revealViewStart("all", !!opts.keyboard);
            });
          }
        });
        return;
      }

      const oldRects = captureRects(visibleCards());
      const animate = !!opts.animate && !reducedMotion.matches && typeof Element.prototype.animate === "function";
      applyView(true);
      const candidates = matchingNodes(filter, currentQuery);
      const counts = currentQuery ? countsForNodes(candidates) : tagCounts(filter);
      const limit = Math.min(Math.max(BATCH_SIZE, requested), candidates.length);
      const shownEntries = candidates.slice(0, limit);
      setShown(shownEntries.map((n) => n.index));
      setPrimed((prev) => ({
        ...prev,
        ...Object.fromEntries(shownEntries.map((n, i) => [n.index, i < 5 ? "high" : "auto"])),
      }));
      loadedCount = limit;
      currentFilter = filter;
      setActiveFilter(filter);
      const query = currentQuery;
      const accent = filter === "all" ? "" : readAccent(filter);
      setResults((prev) => resultsFor(filter, query, counts, shownEntries.length, accent, prev));
      if (!opts.preserveHistory) persistState("replace");
      const label = query ? `Search results for ${query}` : filter === "all" ? "All apps" : tagFor(filter).label;

      commit(() => {
        refs.alignRef.current();
        if (shownEntries.length < counts.total) scheduleBoundary();
        fitTitles(catalogEl, refs.hostRef.current ?? catalogEl);
        settleFrame = requestAnimationFrame(() => {
          settleFrame = 0;
          if (version !== renderVersion || !catalogEl.isConnected) return;
          if (animate) animateSettledCards(oldRects, version);
          if (opts.reveal) revealViewStart(filter, !!opts.keyboard);
          setAnnouncement(`${label}, ${counts.total} results.`);
          if (opts.restoreFocus) restoreFocus();
        });
      });
    };

    const selectCategory = (filter: string, keyboard: boolean) => {
      if (filter === currentFilter && !currentQuery) {
        stopProgrammaticScroll();
        revealViewStart(filter, keyboard);
        return;
      }
      cancelScrollSave();
      scrollStateDirty = false;
      stopProgrammaticScroll();
      persistState("replace");
      currentQuery = "";
      currentFilter = filter;
      loadedCount = BATCH_SIZE;
      focusedKey = "";
      currentEntryId = createEntryId();
      const next = currentSnapshot(window.scrollY);
      entrySnapshots.set(currentEntryId, next);
      window.history.pushState({ ...historyState(), homeCatalog: next }, "", categoryUrl(filter));
      render(filter, loadedCount, { animate: !keyboard, keyboard, reveal: true });
    };

    function loadMore() {
      const candidates = matchingNodes(currentFilter, currentQuery);
      const counts = currentQuery ? countsForNodes(candidates) : tagCounts(currentFilter);
      if (loadedCount >= counts.total) return;
      render(currentFilter, Math.min(counts.total, loadedCount + BATCH_SIZE), { animate: false, reveal: false });
    }

    apiRef.current = {
      selectCategory,
      showAll: (keyboard) => selectCategory("all", keyboard),
      loadMore,
    };

    const rememberCard = (e: Event) => {
      const card = e.target instanceof Element ? e.target.closest<HTMLElement>(".catalog-card") : null;
      if (!card) return;
      focusedKey = cardIdentity(card);
      persistState("replace");
    };
    const onScroll = () => {
      if (restoringHistory) return;
      scheduleBoundary();
      entrySnapshots.set(currentEntryId, currentSnapshot(window.scrollY));
      scheduleScrollSave();
    };
    const onPopState = () => {
      restoringHistory = true;
      historyRestoreVersion += 1;
      const restoreVersion = historyRestoreVersion;
      if (historyRestoreTimer) window.clearTimeout(historyRestoreTimer);
      historyRestoreTimer = 0;
      cancelScrollSave();
      scrollStateDirty = false;
      stopProgrammaticScroll();
      const filter = filterFromUrl();
      currentQuery = queryFromUrl();
      const historySnapshot = homeState();
      currentEntryId = historySnapshot?.entryId || createEntryId();
      const saved = entrySnapshots.get(currentEntryId) || historySnapshot;
      const requested = saved && saved.filter === filter ? Number(saved.loaded) : BATCH_SIZE;
      const savedScrollY = saved && Number.isFinite(Number(saved.scrollY)) ? Number(saved.scrollY) : null;
      focusedKey = saved?.focusKey || "";
      render(filter, requested || BATCH_SIZE, {
        animate: false,
        reveal: false,
        restoreFocus: true,
        preserveHistory: true,
      });
      if (savedScrollY === null) {
        restoringHistory = false;
        return;
      }
      const stale = () => restoreVersion !== historyRestoreVersion || !catalogEl.isConnected;
      raf(() => {
        if (stale()) return;
        raf(() => {
          if (stale()) return;
          window.scrollTo({ top: savedScrollY, left: 0, behavior: "instant" });
          historyRestoreTimer = window.setTimeout(() => {
            historyRestoreTimer = 0;
            if (stale()) return;
            window.scrollTo({ top: savedScrollY, left: 0, behavior: "instant" });
            persistState("replace");
            restoringHistory = false;
          }, 180);
        });
      });
    };
    const onResize = () => scheduleBoundary();

    catalogEl.addEventListener("focus", rememberCard, true);
    catalogEl.addEventListener("click", rememberCard);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", flushScrollState);
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("popstate", onPopState);

    // The source boots after its deferred scripts; render the URL's view on the next frame.
    raf(() =>
      render(currentFilter, loadedCount, {
        animate: false,
        reveal: false,
        restoreFocus: !!initialSaved,
        preserveHistory: !!initialSaved,
      }),
    );

    return () => {
      flushScrollState();
      renderVersion += 1;
      historyRestoreVersion += 1;
      cancelMotion();
      if (historyRestoreTimer) window.clearTimeout(historyRestoreTimer);
      if (boundaryFrame) cancelAnimationFrame(boundaryFrame);
      frames.forEach((id) => cancelAnimationFrame(id));
      apiRef.current = null;
      catalogEl.removeEventListener("focus", rememberCard, true);
      catalogEl.removeEventListener("click", rememberCard);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", flushScrollState);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("popstate", onPopState);
    };
  }, [refs, setCategoryView]);

  return { activeFilter, view, results, shown, primed, announcement, apiRef };
}

/* ----------------------------------------------------------------------------------------------
 * Markup
 * -------------------------------------------------------------------------------------------- */

function ChevronLeft({ className, style }: { className: string; style?: CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} data-icon="chevron-left" aria-hidden="true" focusable="false">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M15 6l-6 6l6 6" />
    </svg>
  );
}

function ChevronRight({ className, style }: { className: string; style?: CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} data-icon="chevron-right" aria-hidden="true" focusable="false">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M9 6l6 6l-6 6" />
    </svg>
  );
}

function FlashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-outline icon-flash home-catalog-results__count-icon" data-icon="flash" aria-hidden="true" focusable="false">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M3 7h5" />
      <path d="M3 12h3" />
      <path d="M3 17h5" />
      <path d="M14 3l-6 9h5v9l6 -10h-5v-8" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-right home-catalog-results__shortcut-icon" data-icon="arrow-right" aria-hidden="true" focusable="false">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M5 12l14 0" />
      <path d="M13 18l6 -6" />
      <path d="M13 6l6 6" />
    </svg>
  );
}

/** Card body shared by the row card and the selected-view grid card. */
function CardBody({ pattern, image, hitTarget }: { pattern: string; image: ReactNode; hitTarget: ReactNode }) {
  return (
    <>
      <div className="catalog-card-media absolute inset-0 pointer-events-none">{image}</div>
      <div className="catalog-card-media-scrim absolute inset-0 pointer-events-none" />
      <div className={`absolute inset-0 pointer-events-none ${pattern} catalog-card-pattern--subtle`} />
      {hitTarget}
      <div className="catalog-card__persistent-badges" aria-hidden="true">
        <span className="catalog-card-recent-tag"> Recently added </span>
      </div>
      <div className="catalog-card__rest-copy" aria-hidden="true">
        <span className="catalog-card-category-pill catalog-card-category-pill--rest"> Manufacturing </span>
        <span className="catalog-card__title"> Manufacturing ERP </span>
        <span className="catalog-card__desc"> {APP_DESC} </span>
      </div>
      <div className="catalog-card-smooth-blur" aria-hidden="true">
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
      </div>
      <div className="catalog-card__overlay" aria-hidden="true">
        <div className="catalog-card__overlay-copy">
          <span className="catalog-card-category-pill catalog-card-category-pill--overlay catalog-card-reveal"> Manufacturing </span>
          <span className="catalog-card-overlay-title catalog-card-reveal-75"> Manufacturing ERP </span>
          <span className="catalog-card-overlay-desc catalog-card-reveal-150"> {APP_DESC} </span>
        </div>
        <span className="catalog-card-arrow catalog-card-reveal-200">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-up-right" style={ICON_16} data-icon="arrow-up-right" aria-hidden="true" focusable="false">
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M17 7l-10 10" />
            <path d="M8 7l9 0l0 9" />
          </svg>
        </span>
      </div>
    </>
  );
}

const FILTER_LINKS = [
  { slug: "all", href: "/", count: "1 apps", label: "All", color: "var(--foreground)" },
  { slug: "manufacturing", href: "/?category=manufacturing", count: "1 apps", label: "Manufacturing", color: "var(--text-m)" },
] as const;

const FILTER_DATA: Record<string, Record<`data-${string}`, string>> = {
  all: {
    "data-filter": "all",
    "data-home-category-tag": "",
    "data-home-category": "all",
    "data-home-category-label": "All apps",
    "data-home-category-href": "/catalog/",
    "data-live-count": "1",
    "data-planned-count": "0",
  },
  manufacturing: {
    "data-filter": "mfg",
    "data-home-category-tag": "",
    "data-home-category": "manufacturing",
    "data-home-category-id": "mfg",
    "data-home-category-label": "Manufacturing",
    "data-home-category-href": "/catalog/manufacturing/",
    "data-live-count": "1",
    "data-planned-count": "0",
  },
};

export function HomeCatalog() {
  const { setCategoryView, rootRef } = useErpRoot();
  const catalogRef = useRef<HTMLElement>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const filterTrackRef = useRef<HTMLDivElement>(null);
  const rowTrackRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rowTitleRef = useRef<HTMLHeadingElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLButtonElement>(null);

  const { arrows, alignRef, scrollBy } = useFilterBar(filterTrackRef);
  const { rail, apiRef: railRef } = useRowRail(rowTrackRef);
  useCardHover(catalogRef);
  useTitleFit(catalogRef, rootRef);

  const [streamRefs] = useState<StreamRefs>(() => ({
    catalogRef,
    hostRef: rootRef,
    filterBarRef,
    filterTrackRef,
    gridRef,
    headingRef,
    rowTitleRef,
    sentinelRef,
    loadMoreRef,
    alignRef,
  }));
  const { activeFilter, view, results, shown, primed, announcement, apiRef } = useHomeStream(streamRefs, setCategoryView);

  const onTagClick = (event: ReactMouseEvent<HTMLAnchorElement>, slug: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    apiRef.current?.selectCategory(slug, event.detail === 0);
  };
  const onShowAll = (event: ReactMouseEvent<HTMLButtonElement>) => apiRef.current?.showAll(event.detail === 0);
  const onLoadMore = () => apiRef.current?.loadMore();

  const gridCardHidden = shown !== null && !shown.includes(0);
  const gridPriority = primed[0];
  const headerStyle = results.accent ? ({ "--home-results-accent": results.accent } as CSSProperties) : undefined;

  return (
    <main id="main-content" className="flex-1 main--full-bleed tacet-home-page">
      <section ref={catalogRef} id="catalog" className="home-row-catalog" data-catalog-ssr-complete="" data-home-catalog-stream="" data-total-catalog-count="1" data-published-count="1" data-registry-count="0" data-batch-size="20" style={BG_STYLE} data-home-stream-ready="true">
        <div ref={filterBarRef} id="catalog-filter-bar" className="z-30 flex items-stretch" style={BG_STYLE} data-stuck="false" data-bootstrapped="true">
          <div className="catalog-filter-shell">
            <button className={`catalog-filter-scroll${arrows.left ? "" : " hidden"} flex-shrink-0 transition-colors`} style={arrows.left ? { display: "flex" } : undefined} data-dir="left" aria-label="Scroll filters left" onClick={() => scrollBy(-1)}>
              <ChevronLeft className="icon icon-tabler icons-tabler-outline icon-tabler-chevron-left catalog-filter-scroll__icon" />
            </button>
            <div ref={filterTrackRef} className={`catalog-filter-track flex-1 overflow-x-auto flex items-center gap-0 ${arrows.overflow ? "is-overflow" : "is-fit"}`} style={{ scrollbarWidth: "none", overflowY: "hidden" }}>
              {FILTER_LINKS.map((f) => (
                <Link key={f.slug} href={toCloneHref(f.href)} className="catalog-filter-btn font-body text-sm whitespace-nowrap flex-shrink-0" {...FILTER_DATA[f.slug]} aria-current={activeFilter === f.slug ? "page" : undefined} style={{ color: f.color }} onClick={(e) => onTagClick(e, f.slug)}>
                  <span className="catalog-filter-btn__label">{f.label}</span>
                  <span className="catalog-filter-btn__count">{f.count}</span>
                </Link>
              ))}
            </div>
            <button className={`catalog-filter-scroll${arrows.right ? "" : " hidden"} flex-shrink-0 transition-colors`} style={arrows.right ? { display: "flex" } : undefined} data-dir="right" aria-label="Scroll filters right" onClick={() => scrollBy(1)}>
              <ChevronRight className="icon icon-tabler icons-tabler-outline icon-tabler-chevron-right catalog-filter-scroll__icon" />
            </button>
          </div>
        </div>
        <div id="catalog-rows" data-home-all-rows="" hidden={view.allHidden}>
          <div className="catalog-row" data-homepage-row="13" data-homepage-slug="manufacturing" data-homepage-description="Production planning, BOM, shop floor, quality, maintenance, MES, OEE, MRP, and factory operations" data-category="mfg" data-category-label="Manufacturing" data-category-icon="MFG">
            <div className="catalog-row-header flex px-6 lg:px-12 py-6 lg:py-8" style={ROW_HEADER_STYLE}>
              <div className="catalog-row-copy min-w-0">
                <div className="catalog-row-heading flex min-w-0 items-center gap-3 sm:gap-4">
                  <h2 ref={rowTitleRef} className="catalog-row-title min-w-0" tabIndex={-1}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-building-factory-2 catalog-row-title__icon" style={{ color: "var(--row-accent)" }} data-icon="building-factory-2" aria-hidden="true" focusable="false">
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M3 21h18" />
                      <path d="M5 21v-12l5 4v-4l5 4h4" />
                      <path d="M19 21v-8l-1.436 -9.574a.5 .5 0 0 0 -.495 -.426h-1.145a.5 .5 0 0 0 -.494 .418l-1.43 8.582" />
                      <path d="M9 17h1" />
                      <path d="M14 17h1" />
                    </svg>
                    <span className="catalog-row-title__label">Manufacturing</span>
                  </h2>
                </div>
                <Link href={toCloneHref("/catalog/manufacturing/")} className="catalog-row-count home-catalog-results__shortcut" data-catalog-row-count="" data-registry-count="0" data-extra-count="1" data-coverage="Planning, BOM, Shop floor, Quality" aria-label="Browse 1 live Manufacturing apps." style={ROW_COUNT_STYLE}>
                  <span className="home-catalog-results__shortcut-counts">
                    <span className="home-catalog-results__count" data-count-live-group="">
                      <FlashIcon />
                      <span className="home-catalog-results__count-value" data-count-live="">1</span>
                      <span className="home-catalog-results__count-label">live</span>
                    </span>
                    <span className="home-catalog-results__count" data-count-planned-group="" hidden>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-map home-catalog-results__count-icon" data-icon="map" aria-hidden="true" focusable="false">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M3 6l5 -3l8 3l5 -3v15l-5 3l-8 -3l-5 3v-15" />
                        <path d="M8 3v15" />
                        <path d="M16 6v15" />
                      </svg>
                      <span className="home-catalog-results__count-value" data-count-planned="">0</span>
                      <span className="home-catalog-results__count-label">planned</span>
                    </span>
                  </span>
                  <span className="catalog-row-count__arrow home-catalog-results__shortcut-arrow" aria-hidden="true">
                    <ArrowRightIcon />
                  </span>
                </Link>
              </div>
              <div className="catalog-row-tools flex items-center gap-1">
                <button className="catalog-scroll-btn sm:hidden inline-flex items-center justify-center min-w-6 min-h-6 p-2 border border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed" data-dir="left" aria-label="Scroll left" aria-controls="catalog-track-manufacturing" disabled={rail.headerLeftDisabled} onClick={() => railRef.current?.prev()}>
                  <ChevronLeft className="icon icon-tabler icons-tabler-outline icon-tabler-chevron-left" style={ICON_14} />
                </button>
                <button className="catalog-scroll-btn sm:hidden inline-flex items-center justify-center min-w-6 min-h-6 p-2 border border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed" data-dir="right" aria-label="Scroll right" aria-controls="catalog-track-manufacturing" disabled={rail.headerRightDisabled} onClick={() => railRef.current?.next()}>
                  <ChevronRight className="icon icon-tabler icons-tabler-outline icon-tabler-chevron-right" style={ICON_14} />
                </button>
                <div className="catalog-scroll-dots hidden sm:flex items-center gap-1.5 ml-1" role="group" aria-label="Scroll position" style={rail.dotsVisible ? undefined : { visibility: "hidden" }}>
                  {Array.from({ length: rail.pages }, (_, i) => (
                    <button key={i} className={`catalog-dot${i === rail.active ? " catalog-dot--active" : ""}`} aria-label={`Page ${i + 1}`} data-page={String(i)} onClick={() => railRef.current?.toPage(i)} />
                  ))}
                </div>
              </div>
            </div>
            <div className="catalog-track-wrap relative">
              <div ref={rowTrackRef} id="catalog-track-manufacturing" className="catalog-scroll-track catalog-scroll-track--gallery overflow-x-auto" data-catalog-layout="default" style={{ scrollbarWidth: "none" }}>
                <article className="catalog-card catalog-card--has-media catalog-card--landscape" data-catalog-hydration-index="0" data-catalog-injected="true" data-catalog-bootstrap="true" {...CARD_DATA} data-app-thumb="https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=560&h=400&q=78" data-app-photo-id="photo-1581092918056-0c4c3acd3789" style={ROW_CARD_STYLE}>
                  <CardBody
                    pattern="pat-lines"
                    image={
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="catalog-card__image" src="/assets/remote/images.unsplash.com/photo-1581092918056-0c4c3acd3789.jpg" alt="" width="560" height="400" loading="lazy" decoding="async" fetchPriority="low" referrerPolicy="no-referrer" />
                    }
                    hitTarget={<Link href={toCloneHref("/manufacturing-erp")} className="catalog-card__hit-target" data-catalog-card-action="open" aria-label="Open Manufacturing ERP details" />}
                  />
                </article>
              </div>
              <button className="catalog-inline-scroll hidden absolute left-0 top-0 px-3 items-center" style={rail.leftShown ? { display: "flex" } : undefined} data-dir="left" aria-label="Scroll left" aria-controls="catalog-track-manufacturing" onClick={() => railRef.current?.prev()}>
                <ChevronLeft className="icon icon-tabler icons-tabler-outline icon-tabler-chevron-left" style={ICON_64} />
              </button>
              <button className="catalog-inline-scroll hidden absolute right-0 top-0 px-3 items-center" style={rail.rightShown ? { display: "flex" } : undefined} data-dir="right" aria-label="Scroll right" aria-controls="catalog-track-manufacturing" onClick={() => railRef.current?.next()}>
                <ChevronRight className="icon icon-tabler icons-tabler-outline icon-tabler-chevron-right" style={ICON_64} />
              </button>
              <div className="catalog-row-progress" data-catalog-row-progress="" hidden={rail.progressHidden} aria-hidden="true" style={{ "--catalog-scroll-thumb-width": `${rail.thumbWidth}%`, "--catalog-scroll-thumb-left": `${rail.thumbLeft}%` } as CSSProperties}>
                <span className="catalog-row-progress-track">
                  <span className="catalog-row-progress-thumb" data-catalog-scroll-thumb="" />
                </span>
              </div>
            </div>
          </div>
        </div>
        <section className="home-selected-category" data-home-selected-view="" hidden={view.selectedHidden}>
          <header className="home-catalog-results" data-home-results-header="" style={headerStyle}>
            <button type="button" className="home-selected-category__all" data-home-catalog-show-all="" hidden={results.showAllHidden} onClick={onShowAll}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-left home-selected-category__all-icon" data-icon="arrow-left" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M5 12l14 0" />
                <path d="M5 12l6 6" />
                <path d="M5 12l6 -6" />
              </svg>
              <span>All categories</span>
            </button>
            <div className="home-catalog-results__title-row">
              <h2 ref={headingRef} className="home-catalog-results__heading" data-home-results-heading="" tabIndex={-1}>
                {results.heading}
              </h2>
              <span className="home-catalog-results__summary home-catalog-results__summary--linked" data-home-results-summary="">
                <span className="home-catalog-results__shortcut-counts">
                  <span className="home-catalog-results__count" data-home-results-count="live" hidden={results.liveHidden}>
                    <FlashIcon />
                    <span className="home-catalog-results__count-value" data-home-results-count-value="">
                      {results.liveCount}
                    </span>
                    <span>live</span>
                  </span>
                </span>
                <Link href={toCloneHref(results.linkHref)} className="home-catalog-results__shortcut-arrow" data-home-results-link="" hidden={results.linkHidden} aria-label={results.linkAriaLabel ?? undefined}>
                  <ArrowRightIcon />
                </Link>
              </span>
            </div>
          </header>
          <div className="home-catalog-row">
            <div ref={gridRef} className="catalog-scroll-track catalog-scroll-track--gallery home-catalog-grid" data-home-catalog-grid="">
              <article className="catalog-card catalog-card--has-media catalog-card--landscape" hidden={gridCardHidden} data-catalog-hydration-index="0" data-catalog-result-card="true" data-catalog-result-index="0" data-catalog-injected="true" data-catalog-bootstrap="true" {...CARD_DATA} data-app-thumb="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=560&h=400&q=78" data-app-photo-id="photo-1581091226825-a6a2a5aee158" data-home-index="0" data-home-category="manufacturing" data-home-source="published" style={GRID_CARD_STYLE}>
                <CardBody
                  pattern="pat-dots"
                  image={
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="catalog-card__image" src="/assets/remote/images.unsplash.com/photo-1581091226825-a6a2a5aee158.jpg" alt="" width="560" height="400" loading={gridPriority ? "eager" : "lazy"} decoding="async" fetchPriority={gridPriority ?? "low"} referrerPolicy="no-referrer" />
                  }
                  hitTarget={<button type="button" className="catalog-card__hit-target" data-catalog-card-action="open" aria-label="Open Manufacturing ERP details" />}
                />
              </article>
            </div>
          </div>
          <div className="home-catalog-progress" data-home-catalog-controls="">
            <p data-home-catalog-progress="" aria-live="polite">
              {results.progress}
            </p>
            <button ref={loadMoreRef} type="button" className="home-catalog-load-more" data-home-catalog-load-more="" hidden={results.loadMoreHidden} onClick={onLoadMore}>
              {results.loadMoreText}
            </button>
            <a href="#catalog-filter-bar" className="home-catalog-back" data-home-catalog-back="" hidden={results.backHidden}>
              Back to categories
            </a>
          </div>
          <div ref={sentinelRef} className="home-catalog-sentinel" data-home-catalog-sentinel="" aria-hidden="true" hidden={results.sentinelHidden} />
          <div className="home-catalog-end" data-home-catalog-end="" hidden={results.endHidden}>
            <p data-home-catalog-end-copy="">{results.endCopy}</p>
            <button type="button" data-home-catalog-show-all="" hidden={results.showAllHidden} onClick={onShowAll}>
              All categories
            </button>
          </div>
          <p className="sr-only" data-home-catalog-announcement="" aria-live="polite">
            {announcement}
          </p>
        </section>
      </section>
    </main>
  );
}
