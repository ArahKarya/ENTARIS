import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatRupiah } from '../../lib/formatters';

export interface AccountNode {
  id: string;
  name: string;
  accountNumber?: string;
  isGroup?: boolean;
  balance: number;
  children?: AccountNode[];
}

interface TreeTableProps {
  data: AccountNode[];
  /** Pixels per indent level (default 24) */
  indentPx?: number;
  /** Tailwind width class for the value column (default 'w-44') */
  valueColWidth?: string;
  /** Custom value formatter (default formatRupiah) */
  formatValue?: (v: number) => string;
  /** Show account numbers (default true) */
  showAccountNumber?: boolean;
  /** Highlight isGroup rows with bg (default true) */
  highlightGroups?: boolean;
  /** Callback when a leaf account balance is clicked (for drill-down) */
  onAccountClick?: (accountId: string, accountName: string) => void;
}

// Recursive Row

const AccountTreeRow: React.FC<{
  account: AccountNode;
  depth: number;
  indentPx: number;
  valueColWidth: string;
  fmt: (v: number) => string;
  showAccountNumber: boolean;
  highlightGroups: boolean;
  onAccountClick?: (accountId: string, accountName: string) => void;
}> = ({ account, depth, indentPx, valueColWidth, fmt, showAccountNumber, highlightGroups, onAccountClick }) => {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = (account.children?.length ?? 0) > 0;
  const isClickable = !account.isGroup && onAccountClick;

  const handleBalanceClick = (e: React.SyntheticEvent) => {
    if (isClickable) {
      e.stopPropagation();
      onAccountClick!(account.id, account.name);
    }
  };

  return (
    <>
      <div
        className={cn(
          'flex items-center py-2.5 border-b border-border hover:bg-accent transition-colors cursor-pointer',
          highlightGroups && account.isGroup ? 'bg-muted/60' : ''
        )}
        style={{ paddingLeft: `${depth * indentPx + 16}px` }}
        {...(hasChildren
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-expanded': isOpen,
              onClick: () => setIsOpen(!isOpen),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  setIsOpen(!isOpen);
                }
              },
            }
          : {})}
      >
        <div className="flex items-center flex-1 min-w-0 gap-2">
          {hasChildren ? (
            <span className="text-muted-foreground">
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          ) : (
            <span className="w-3.5 inline-block" />
          )}
          {showAccountNumber && (
            <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">
              {account.accountNumber}
            </span>
          )}
          <span
            className={cn(
              'text-sm truncate',
              account.isGroup ? 'font-semibold text-foreground' : 'text-foreground-secondary'
            )}
          >
            {account.name}
          </span>
        </div>
        <div
          className={cn(
            'text-sm tabular-nums font-medium text-right px-4 shrink-0 whitespace-nowrap',
            valueColWidth,
            account.balance < 0 ? 'text-danger-text' : 'text-foreground',
            isClickable ? 'cursor-pointer hover:underline text-primary ' : ''
          )}
          {...(isClickable
            ? {
                role: 'button',
                tabIndex: 0,
                onClick: handleBalanceClick,
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleBalanceClick(e);
                  }
                },
              }
            : {})}
        >
          {fmt(Math.abs(account.balance))}
        </div>
      </div>

      {isOpen &&
        hasChildren &&
        account.children!.map((child) => (
          <AccountTreeRow
            key={child.id}
            account={child}
            depth={depth + 1}
            indentPx={indentPx}
            valueColWidth={valueColWidth}
            fmt={fmt}
            showAccountNumber={showAccountNumber}
            highlightGroups={highlightGroups}
            onAccountClick={onAccountClick}
          />
        ))}
    </>
  );
};

const AccountTreeTable: React.FC<TreeTableProps> = ({
  data,
  indentPx = 24,
  valueColWidth = 'w-48',
  formatValue = formatRupiah,
  showAccountNumber = true,
  highlightGroups = true,
  onAccountClick,
}) => (
  <>
    {data.map((account) => (
      <AccountTreeRow
        key={account.id}
        account={account}
        depth={0}
        indentPx={indentPx}
        valueColWidth={valueColWidth}
        fmt={formatValue}
        showAccountNumber={showAccountNumber}
        highlightGroups={highlightGroups}
        onAccountClick={onAccountClick}
      />
    ))}
  </>
);

export default AccountTreeTable;
