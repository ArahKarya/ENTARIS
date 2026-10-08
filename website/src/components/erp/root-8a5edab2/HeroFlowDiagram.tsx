"use client";

import { useEffect, useRef, useState } from "react";

export type FlowStep = {
  id: string;
  name: string;
  detail: string;
  sub: string;
  kind: "document" | "gate" | "order" | "match" | "prompt" | "gateway" | "permission" | "service" | "record";
};

export type FlowData = {
  eyebrow: { name: string; context: string };
  headerContext?: string;
  caption: string;
  steps: readonly FlowStep[];
};

export const HUMAN_FLOW: FlowData = {
  eyebrow: { name: "Procure-to-Pay", context: "Alur Operasional ERP" },
  headerContext: "otorisasi berjenjang",
  caption: "4 peran bawaan (Admin, Keuangan, Operasional, Auditor) · Jejak audit di setiap mutasi · Double-entry seimbang (PSAK)",
  steps: [
    { id: "req", name: "Pengajuan", detail: "PR-2026-0041", sub: "Kebutuhan operasional", kind: "document" },
    { id: "gate", name: "Approval Gate", detail: "Plafon wewenang", sub: "Otorisasi berjenjang", kind: "gate" },
    { id: "po", name: "Order Beli (PO)", detail: "PO-2026-0118", sub: "Vendor resmi", kind: "order" },
    { id: "recv", name: "Terima Fisik", detail: "STT fisik · Stok WAC", sub: "Akrual Hutang (2.1.5)", kind: "match" },
    { id: "pay", name: "Faktur & Jurnal", detail: "3-Way Match · PI", sub: "Debit/Kredit seimbang", kind: "gate" },
  ],
};

export const AGENT_FLOW: FlowData = {
  eyebrow: { name: "Jalur Eksekusi AIRA", context: "Headless MCP" },
  headerContext: "satu servis per panggilan",
  caption: "Streamable HTTP /mcp · Ratusan tool bisnis aktif · Mutasi finansial wajib disetujui manusia (audit_trail.via = 'mcp')",
  steps: [
    { id: "prompt", name: "Instruksi Alami", detail: "Chat & PWA HP", sub: "Tanpa input teknis", kind: "prompt" },
    { id: "auth", name: "Actor Token", detail: "HMAC-SHA256", sub: "X-Entaris-Actor (120s)", kind: "gateway" },
    { id: "rbac", name: "Cek Hak Akses", detail: "Hak setara staf", sub: "Anti-bypass gate (RBAC)", kind: "permission" },
    { id: "tool", name: "Katalog Tool MCP", detail: "POST /mcp", sub: "Draf otomatis aman", kind: "service" },
    { id: "audit", name: "Approval & GL", detail: "ApprovalRequest", sub: "Jurnal terposting permanen", kind: "record" },
  ],
};

export function useHeroFlowClock() {
  const [step, setStep] = useState(0);
  const [isPassing, setIsPassing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;

    let timer: ReturnType<typeof setTimeout>;
    if (isPassing) {
      const duration = step === 4 ? 2400 : 1100;
      timer = setTimeout(() => {
        setStep((s) => (s + 1) % 5);
        setIsPassing(false);
      }, duration);
    } else {
      timer = setTimeout(() => {
        setIsPassing(true);
      }, 1800);
    }

    return () => clearTimeout(timer);
  }, [step, isPassing, isPaused]);

  const selectStep = (n: number) => {
    setStep(n);
    setIsPassing(false);
    setIsPaused(true);
  };

  const togglePause = () => {
    setIsPaused((p) => !p);
  };

  return { step, isPassing, isPaused, selectStep, togglePause };
}

function StepIcon({ kind }: { kind: FlowStep["kind"] }) {
  switch (kind) {
    case "document":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path className="flow-aura" d="M18 13 Q18 9 22 9 L36 9 Q40 9 42.83 11.83 L47.17 16.17 Q50 19 50 23 L50 51 Q50 55 46 55 L22 55 Q18 55 18 51Z" />
          <path className="flow-surface" d="M18 13 Q18 9 22 9 L36 9 Q40 9 42.83 11.83 L47.17 16.17 Q50 19 50 23 L50 51 Q50 55 46 55 L22 55 Q18 55 18 51Z" />
          <path d="M40 9v11h10" />
          <path className="flow-ink" d="M25 29h18M25 35h18M25 41h11" />
        </svg>
      );
    case "gate":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path className="flow-aura" d="M28.46 10.54 Q32 7 35.54 10.54 L53.46 28.46 Q57 32 53.46 35.54 L35.54 53.46 Q32 57 28.46 53.46 L10.54 35.54 Q7 32 10.54 28.46Z" />
          <path className="flow-surface" d="M28.46 10.54 Q32 7 35.54 10.54 L53.46 28.46 Q57 32 53.46 35.54 L35.54 53.46 Q32 57 28.46 53.46 L10.54 35.54 Q7 32 10.54 28.46Z" />
          <path className="flow-check" d="m22 32 7 7 14-15" />
          <path className="flow-gate" d="M32 17v30" />
        </svg>
      );
    case "order":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path className="flow-aura" d="M16 14.4 Q16 12 18.4 12 L44.6 12 Q47 12 47 14.4 L47 48.6 Q47 51 45.33 50 L43.67 49 Q42 48 40.33 49 L38.67 50 Q37 51 35.33 50 L33.67 49 Q32 48 30.33 49 L28.67 50 Q27 51 25.33 50 L23.67 49 Q22 48 20 49 L18 50 Q16 51 16 48.6Z" />
          <path className="flow-surface" d="M16 14.4 Q16 12 18.4 12 L44.6 12 Q47 12 47 14.4 L47 48.6 Q47 51 45.33 50 L43.67 49 Q42 48 40.33 49 L38.67 50 Q37 51 35.33 50 L33.67 49 Q32 48 30.33 49 L28.67 50 Q27 51 25.33 50 L23.67 49 Q22 48 20 49 L18 50 Q16 51 16 48.6Z" />
          <path className="flow-ink" d="M23 23h17M23 29h17M23 35h9" />
        </svg>
      );
    case "match":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path className="flow-aura" d="M33.88 22.12 Q36 20 38.12 22.12 L45.88 29.88 Q48 32 45.88 34.12 L38.12 41.88 Q36 44 33.88 41.88 L26.12 34.12 Q24 32 26.12 29.88Z" />
          <path className="flow-input" d="M3 15h9l14 17M3 32h23M3 49h9l14-17" />
          <path className="flow-surface" d="M33.88 22.12 Q36 20 38.12 22.12 L45.88 29.88 Q48 32 45.88 34.12 L38.12 41.88 Q36 44 33.88 41.88 L26.12 34.12 Q24 32 26.12 29.88Z" />
          <path className="flow-check" d="m30 32 4 4 8-9" />
          <path d="M48 32h13" />
        </svg>
      );
    case "prompt":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path className="flow-aura" d="M8 18.5 Q8 14 12.5 14 L51.5 14 Q56 14 56 18.5 L56 45.5 Q56 50 51.5 50 L12.5 50 Q8 50 8 45.5Z" />
          <path className="flow-surface" d="M8 18.5 Q8 14 12.5 14 L51.5 14 Q56 14 56 18.5 L56 45.5 Q56 50 51.5 50 L12.5 50 Q8 50 8 45.5Z" />
          <path d="M8 22h48" />
          <path className="flow-ink" d="m17 30 6 5-6 5M29 40h11" />
          <circle cx="13" cy="18" r=".7" />
        </svg>
      );
    case "gateway":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path className="flow-aura" d="M17 18.5 Q17 14 21.5 14 L42.5 14 Q47 14 47 18.5 L47 45.5 Q47 50 42.5 50 L21.5 50 Q17 50 17 45.5Z" />
          <path className="flow-surface" d="M17 18.5 Q17 14 21.5 14 L42.5 14 Q47 14 47 18.5 L47 45.5 Q47 50 42.5 50 L21.5 50 Q17 50 17 45.5Z" />
          <path className="flow-gate" d="M26 20v24M38 20v24" />
          <path className="flow-input" d="M2 32h15M47 32h15" />
        </svg>
      );
    case "permission":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path className="flow-aura" d="M29.5 8.9Q32 8 34.5 8.9L49.5 14.1Q52 15 52 17.5V32C52 42.5 36 53 34 54.3Q32 56 30 54.3C28 53 12 42.5 12 32V17.5Q12 15 14.5 14.1Z" />
          <path className="flow-surface" d="M29.5 8.9Q32 8 34.5 8.9L49.5 14.1Q52 15 52 17.5V32C52 42.5 36 53 34 54.3Q32 56 30 54.3C28 53 12 42.5 12 32V17.5Q12 15 14.5 14.1Z" />
          <path className="flow-check" d="m23 31 6 6 13-14" />
          <path className="flow-gate" d="M25 29v-4a7 7 0 0 1 14 0v4M23 29h18v13H23Z" />
        </svg>
      );
    case "service":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <rect className="flow-aura" x="12" y="12" width="40" height="40" rx="5" />
          <rect className="flow-surface" x="12" y="12" width="40" height="40" rx="5" />
          <path d="M12 25h40M12 39h40" />
          <path className="flow-ink" d="M28 19h16M28 32h16M28 45h16" />
          <circle cx="20" cy="19" r="1" />
          <circle cx="20" cy="32" r="1" />
          <circle cx="20" cy="45" r="1" />
        </svg>
      );
    case "record":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path className="flow-aura" d="M13 17c0-10 38-10 38 0v29c0 10-38 10-38 0Z" />
          <path className="flow-surface" d="M13 17c0-10 38-10 38 0v29c0 10-38 10-38 0Z" />
          <ellipse cx="32" cy="17" rx="19" ry="7" />
          <path className="flow-check" d="m23 36 6 6 14-15" />
        </svg>
      );
  }
}

interface HeroFlowDiagramProps {
  kind: "human" | "agent";
  step: number;
  isPassing: boolean;
  isPaused: boolean;
  onSelectStep: (idx: number) => void;
  onTogglePause: () => void;
}

export function HeroFlowDiagram({
  kind,
  step,
  isPassing,
  isPaused,
  onSelectStep,
  onTogglePause,
}: HeroFlowDiagramProps) {
  const data = kind === "human" ? HUMAN_FLOW : AGENT_FLOW;
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const updateWidth = () => {
      if (!listRef.current) return;
      const connections = listRef.current.querySelectorAll<HTMLElement>(".hero-flow__connection");
      connections.forEach((conn) => {
        conn.style.setProperty("--flow-link-width", `${conn.clientWidth}px`);
      });
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  return (
    <div
      className={`hero-plate hero-plate--${kind}`}
      data-flow-phase={isPassing ? "passing" : "holding"}
      data-flow-moving={String(!isPaused)}
    >
      <div className="hero-plate__head">
        <div className="proto-section-eyebrow proto-section-eyebrow--underline">
          <span className="proto-section-eyebrow__rail" aria-hidden="true" />
          <span className="proto-section-eyebrow__copy">
            <span className="proto-section-eyebrow__name">{data.eyebrow.name}</span>
            <span className="proto-section-eyebrow__context">· {data.eyebrow.context}</span>
          </span>
        </div>
        {data.headerContext && (
          <span className="hero-plate__head-context">{data.headerContext}</span>
        )}
      </div>

      <div className="hero-flow" data-flow={kind} data-moving={String(!isPaused)}>
        <div
          className="hero-flow__viewport"
          tabIndex={0}
          role="region"
          aria-label={`Diagram alur proses ${kind}`}
        >
          <ol ref={listRef} className="hero-flow__steps">
            {data.steps.map((item, idx) => {
              const isCurrent = idx === step;
              const isStepPassing = idx === step && isPassing;
              const isDone = idx < step;
              const stepClass = [
                "hero-flow__step",
                isCurrent ? "is-current" : "",
                isStepPassing ? "is-passing" : "",
                isDone ? "is-done" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <li key={item.id} className={stepClass} data-step={idx} data-kind={item.kind}>
                  <span className="hero-flow__connection" aria-hidden="true">
                    <i />
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectStep(idx)}
                    data-flow-select={idx}
                    aria-pressed={isCurrent}
                    title={`${item.name}: ${item.detail}`}
                  >
                    <StepIcon kind={item.kind} />
                    <strong>{item.name}</strong>
                    <span className="hero-flow__detail">
                      <span>{item.detail}</span>
                      <small>{item.sub}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="hero-flow__footer">
          <p className="hero-flow__caption">{data.caption}</p>
          <button
            type="button"
            className="hero-flow__toggle"
            onClick={onTogglePause}
            aria-pressed={isPaused}
            aria-label={isPaused ? "Lanjutkan diagram" : "Jeda diagram"}
            title={isPaused ? "Lanjutkan animasi alur" : "Jeda animasi alur"}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" width={14} height={14}>
              <path
                className="flow-pause"
                d="M5 3.5v9M11 3.5v9"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
              />
              <path className="flow-play" d="m5 3 8 5-8 5Z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
