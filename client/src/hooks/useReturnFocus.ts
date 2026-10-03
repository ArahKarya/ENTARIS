import { useRef } from 'react';

/**
 * Where focus should go back to. A dialog opened from a menu item captures the
 * item itself, which is gone once the menu closes; return to the menu's
 * trigger instead (Radix labels its menu content with the trigger id).
 */
function returnTarget(active: Element | null): HTMLElement | null {
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  const menu = active.closest('[role="menu"]');
  if (!menu) return active;
  // Submenus are labelled by their sub-trigger; walk up to the root menu.
  let root: Element = menu;
  for (let i = 0; i < 5; i++) {
    const labelledBy = root.getAttribute('aria-labelledby');
    const trigger = labelledBy ? document.getElementById(labelledBy) : null;
    const parentMenu = trigger?.closest('[role="menu"]');
    if (!trigger) return active;
    if (!parentMenu) return trigger;
    root = parentMenu;
  }
  return active;
}

/**
 * Focus return for Radix dialogs opened without a <Dialog.Trigger> (e.g. from
 * a hotkey or another menu). Radix only refocuses its own trigger, so without
 * one focus would fall to <body>. Spread the handlers on Dialog.Content.
 */
export function useReturnFocus() {
  const previous = useRef<HTMLElement | null>(null);
  return {
    /** Remembers what had focus; call before (or inside) your own open handler. */
    capture: () => {
      previous.current = returnTarget(document.activeElement);
    },
    onCloseAutoFocus: (event: Event) => {
      const target = previous.current;
      previous.current = null;
      if (target?.isConnected) {
        event.preventDefault();
        target.focus();
      }
    },
  };
}
