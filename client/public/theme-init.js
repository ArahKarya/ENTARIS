/*
 * No-flash theme bootstrap. Loaded synchronously from <head> before the app
 * bundle so <html> already carries .light/.dark at first paint.
 * Kept as an external file (not inline) because the production CSP is
 * script-src 'self'. Mirrors normalizeTheme() in src/contexts/ThemeContext.tsx:
 * only 'light' | 'dark' | 'system' are valid; anything else migrates to 'system'.
 */
(function () {
  var theme = 'system';
  try {
    var stored = window.localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      theme = stored;
    } else if (stored !== null) {
      window.localStorage.setItem('theme', 'system');
    }
  } catch (e) {
    /* storage blocked: fall back to system */
  }
  var dark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;
  root.classList.add(dark ? 'dark' : 'light');
  root.style.colorScheme = dark ? 'dark' : 'light';
})();

/*
 * Motion level (DESIGN.md "Gerak"). Mirrors resolveMotion() in src/lib/motion.ts:
 * a stored level wins; otherwise reduced-motion devices get 'none', others 'smooth'.
 */
(function () {
  var level = null;
  try {
    level = window.localStorage.getItem('motion');
  } catch (e) {
    /* storage blocked: follow the device */
  }
  if (level !== 'none' && level !== 'minimal' && level !== 'smooth' && level !== 'lively') {
    var reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    level = reduced ? 'none' : 'smooth';
  }
  document.documentElement.setAttribute('data-motion', level);
})();
