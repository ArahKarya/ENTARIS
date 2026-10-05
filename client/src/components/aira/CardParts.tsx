// Kartu hasil di dalam jawaban AIRA (dari petunjuk `card` hasil tool MCP): draft yang dibuat dan
// antrian persetujuan. Generik: satu renderer untuk semua jenis; tautan internal pakai router.

import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, FileSignature, HandCoins, NotebookPen, Factory, ShieldCheck, ShoppingCart } from 'lucide-react';
import type { ComponentType } from 'react';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import { isInternalPath } from './cardUtils';
import type { CardPart } from './types';

type IconType = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const KIND: Record<CardPart['kind'], { icon: IconType; label: string; cta: string; tone: string }> = {
  cash_book_draft: { icon: NotebookPen, label: 'Draft Buku Kas', cta: 'Tinjau draft', tone: 'text-primary' },
  production_draft: { icon: Factory, label: 'Draft Produksi', cta: 'Buka draft produksi', tone: 'text-primary' },
  payment_request_draft: { icon: HandCoins, label: 'Pengajuan Pembayaran', cta: 'Buka pengajuan', tone: 'text-primary' },
  purchase_order_draft: { icon: ShoppingCart, label: 'Pesanan Pembelian', cta: 'Buka daftar PO', tone: 'text-primary' },
  quotation_draft: { icon: FileSignature, label: 'Penawaran', cta: 'Buka daftar penawaran', tone: 'text-primary' },
  sales_order_draft: { icon: ClipboardList, label: 'Pesanan Penjualan', cta: 'Buka daftar SO', tone: 'text-primary' },
  approval: { icon: ShieldCheck, label: 'Menunggu persetujuan', cta: 'Buka Persetujuan', tone: 'text-warning-text' },
  link: { icon: ArrowRight, label: 'Tautan', cta: 'Buka', tone: 'text-primary' },
};

export function CardPartView({ card }: { card: CardPart }) {
  const meta = KIND[card.kind] ?? KIND.link;
  const Icon = meta.icon;
  const safe = isInternalPath(card.href);
  return (
    <section
      aria-label={`${meta.label}: ${card.title}`}
      className="flex w-full max-w-md items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm shadow-[var(--shadow-1)]"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle">
        <Icon className={cn('size-4', meta.tone)} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="break-words font-medium text-foreground">{card.title}</p>
        {card.summary && <p className="break-words text-xs text-muted-foreground">{card.summary}</p>}
        {card.facts && card.facts.length > 0 && (
          <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
            {card.facts.map((f) => (
              <div key={f.label} className="flex gap-1">
                <dt className="text-muted-foreground">{f.label}:</dt>
                <dd className="text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {card.status && <StatusBadge status={card.status} />}
          {safe && (
            <Link
              to={card.href}
              className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {meta.cta}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
