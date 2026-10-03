import type { ReactNode } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface RowAction {
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  /** Danger actions are listed last, after a separator, in red. */
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Convenience for permission checks: hidden actions are not rendered. */
  hidden?: boolean;
}

export interface RowActionsProps {
  actions: RowAction[];
  /** Accessible name of the ⋯ trigger, e.g. "Aksi untuk SI-202610-0005". */
  label: string;
  className?: string;
}

/** Per-row "⋯" menu (Radix dropdown). Renders nothing when no action is visible. */
export function RowActions({ actions, label, className }: RowActionsProps) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;
  const normal = visible.filter((a) => a.tone !== 'danger');
  const danger = visible.filter((a) => a.tone === 'danger');

  const item = (a: RowAction) => {
    const Icon = a.icon;
    return (
      <DropdownMenuItem
        key={a.label}
        disabled={a.disabled}
        onSelect={a.onSelect}
        className={cn(a.tone === 'danger' && 'text-danger-text focus:bg-danger-subtle focus:text-danger-text')}
      >
        {Icon && <Icon aria-hidden strokeWidth={1.75} />}
        {a.label}
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} className={cn('text-muted-foreground', className)}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {normal.map(item)}
        {normal.length > 0 && danger.length > 0 && <DropdownMenuSeparator />}
        {danger.map(item)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface DocumentLinkProps {
  children: ReactNode;
  onClick: () => void;
  /**
   * Inside a clickable DataTable row the row itself is the keyboard target, so
   * the link stays out of the tab order (default). Set true when the row is
   * not clickable.
   */
  focusable?: boolean;
  className?: string;
}

/** Document number rendered as a button that opens the detail view. */
export function DocumentLink({ children, onClick, focusable = false, className }: DocumentLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={focusable ? undefined : -1}
      // primary-hover keeps ≥4.5:1 on the hovered/focused row background too.
      className={cn(
        'num rounded-sm font-mono text-xs font-medium text-primary-hover underline-offset-2 hover:underline',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {children}
    </button>
  );
}
