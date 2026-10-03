"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

/*
 * Port of downloads.js ("OS-aware Proto download CTAs"), scoped to `scope`.
 * Markup owns the real release URLs; on mount the best match for the visitor's OS is promoted to
 * the primary button (href / data-platform / aria-label / label text) and hidden from the
 * "Other platforms" menu. Unknown OS → fallback URL/label, menu label "Choose platform", all
 * options visible. Menu: trigger toggles data-open + aria-expanded, Escape closes and refocuses
 * the trigger, a click outside closes it. Everything is removed on unmount.
 */

type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: unknown } };

function detectPlatform(): string {
  const uaData = (navigator as NavigatorWithUAData).userAgentData;
  let platform = "";
  if (uaData && typeof uaData.platform === "string" && uaData.platform.trim()) platform = uaData.platform;
  if (!platform) platform = [navigator.platform, navigator.userAgent].join(" ");
  platform = platform.toLowerCase();
  if (platform.includes("win")) return "windows";
  if (platform.includes("mac")) return "macos";
  if (platform.includes("linux") || platform.includes("x11")) return "linux";
  return "";
}

const setText = (el: Element | null, text: string): void => {
  if (el) el.textContent = text;
};

function applyFallback(picker: Element, options: HTMLElement[]): void {
  const fallbackUrl = picker.getAttribute("data-download-fallback-url") || "";
  const fallbackLabel = picker.getAttribute("data-download-fallback-label") || "Download Proto";
  const primary = picker.querySelector("[data-download-primary]");
  picker.setAttribute("data-current-platform", "unknown");
  if (primary) {
    primary.setAttribute("href", fallbackUrl);
    primary.setAttribute("data-platform", "");
    primary.setAttribute("aria-label", fallbackLabel);
  }
  setText(picker.querySelector("[data-download-primary-label]"), fallbackLabel);
  setText(picker.querySelector("[data-download-menu-label]"), "Choose platform");
  for (const option of options) option.hidden = false;
}

function setPickerPlatform(picker: Element, platform: string): void {
  const options = Array.from(picker.querySelectorAll<HTMLElement>("[data-download-option]"));
  const selected = options.find((option) => option.getAttribute("data-platform") === platform);
  if (!selected) {
    applyFallback(picker, options);
    return;
  }
  const data = {
    platform: selected.getAttribute("data-platform") || "",
    label: selected.getAttribute("data-label") || (selected.textContent ?? "").trim(),
    headline: selected.getAttribute("data-headline") || "",
    meta: selected.getAttribute("data-meta") || "",
    url: selected.getAttribute("href") || "",
  };
  const primary = picker.querySelector("[data-download-primary]");
  picker.setAttribute("data-current-platform", data.platform);
  if (primary) {
    primary.setAttribute("href", data.url);
    primary.setAttribute("data-platform", data.platform);
    primary.setAttribute("aria-label", data.label);
  }
  setText(picker.querySelector("[data-download-primary-label]"), data.label);
  setText(picker.querySelector("[data-download-card-headline]"), data.headline);
  setText(picker.querySelector("[data-download-primary-meta]"), data.meta);
  setText(picker.querySelector("[data-download-menu-label]"), "Other platforms");
  for (const option of options) option.hidden = option.getAttribute("data-platform") === data.platform;
}

function setMenuOpen(menu: Element, open: boolean): void {
  if (open) menu.setAttribute("data-open", "true");
  else menu.removeAttribute("data-open");
  menu.querySelector("[data-download-menu-trigger]")?.setAttribute("aria-expanded", open ? "true" : "false");
}

export function useDownloadPicker(scope: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const disposers: (() => void)[] = [];
    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Document, type: K, handler: (event: HTMLElementEventMap[K]) => void): void => {
      target.addEventListener(type, handler as EventListener);
      disposers.push(() => target.removeEventListener(type, handler as EventListener));
    };

    const platform = detectPlatform();
    const menus: HTMLElement[] = [];
    for (const picker of Array.from(root.querySelectorAll("[data-download-picker]"))) {
      setPickerPlatform(picker, platform);
      // The captured markup already carries data-download-menu-bound="true", so bind unconditionally.
      for (const menu of Array.from(picker.querySelectorAll<HTMLElement>("[data-download-menu]"))) {
        const trigger = menu.querySelector<HTMLElement>("[data-download-menu-trigger]");
        if (!trigger) continue;
        menu.setAttribute("data-download-menu-bound", "true");
        menus.push(menu);
        on(trigger, "click", () => setMenuOpen(menu, !menu.hasAttribute("data-open")));
        on(menu, "keydown", (event) => {
          if (event.key !== "Escape") return;
          setMenuOpen(menu, false);
          trigger.focus();
        });
      }
    }
    on(document, "click", (event) => {
      const target = event.target;
      for (const menu of menus) {
        if (menu.hasAttribute("data-open") && !(target instanceof Node && menu.contains(target))) setMenuOpen(menu, false);
      }
    });

    return () => {
      disposers.forEach((dispose) => dispose());
      menus.forEach((menu) => setMenuOpen(menu, false));
    };
  }, [scope]);
}
