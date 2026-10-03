/**
 * Shared class strings for the ui primitives. Kept in a .ts module so the
 * component files only export components (react-refresh/only-export-components).
 */

/** Shared focus treatment: 2px ring + 2px offset in the canvas colour. */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * Control chrome shared by Input, Textarea and SelectTrigger.
 * 16px text below md prevents iOS Safari from zooming on focus; desktop uses 14px.
 */
export const controlBase = [
  'w-full min-w-0 rounded-md border border-input bg-card text-base text-foreground md:text-sm',
  'transition-[color,box-shadow,border-color] placeholder:text-muted-foreground',
  'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60',
  'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger',
].join(' ');

/** Single scrim used by every overlay (Dialog, Sheet). */
export const overlayClass =
  'fixed inset-0 z-[var(--z-overlay)] bg-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

/** Close (X) button shared by Dialog and Sheet. */
export const closeButtonClass =
  'absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card';
