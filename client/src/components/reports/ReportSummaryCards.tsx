import React from 'react';
import { cn } from '../../lib/utils';
import { formatRupiah } from '../../lib/formatters';

export interface SummaryCard {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  bgColor: string;
  formatValue?: (v: number) => string;
}

interface Props {
  cards: SummaryCard[];
  /** Highlighted card rendered with accent bg + white text */
  accentCard?: SummaryCard;
}

const ReportSummaryCards: React.FC<Props> = ({ cards, accentCard }) => {
  const fmt = (card: SummaryCard) => (card.formatValue || formatRupiah)(card.value);
  const cols = accentCard ? cards.length + 1 : cards.length;

  return (
    <div className={`grid grid-cols-2 lg:grid-cols-${Math.min(cols, 4)} gap-4`}>
      {cards.map((card, i) => (
        <div key={i} className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', card.bgColor)}>
              <card.icon size={14} className={card.color} />
            </div>
            <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
          </div>
          <p className={cn('text-lg sm:text-xl font-semibold tabular-nums truncate', card.color)} title={fmt({ ...card, value: Math.abs(card.value) })}>
            {card.value < 0 ? '- ' : ''}{fmt({ ...card, value: Math.abs(card.value) })}
          </p>
        </div>
      ))}

      {accentCard && (
        <div className="bg-primary rounded-xl p-4 text-primary-foreground">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
              <accentCard.icon size={14} className="text-primary-foreground" />
            </div>
            <span className="text-xs font-medium text-primary-foreground">{accentCard.label}</span>
          </div>
          <p className={cn('text-lg sm:text-xl font-semibold tabular-nums truncate', accentCard.value >= 0 ? 'text-primary-foreground' : 'text-danger-foreground')} title={fmt({ ...accentCard, value: Math.abs(accentCard.value) })}>
            {accentCard.value < 0 ? '- ' : ''}{fmt({ ...accentCard, value: Math.abs(accentCard.value) })}
          </p>
        </div>
      )}
    </div>
  );
};

export default ReportSummaryCards;
