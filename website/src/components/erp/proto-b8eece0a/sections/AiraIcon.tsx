/** Tabler outline icon paths used on the AIRA page (MIT, tabler.io/icons). */
const PATHS = {
  "chart-bar": ["M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z", "M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z", "M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z", "M4 20h14"],
  "trending-up": ["M3 17l6 -6l4 4l8 -8", "M14 7l7 0l0 7"],
  cash: ["M7 15h-3a1 1 0 0 1 -1 -1v-8a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v3", "M7 9m0 1a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1z", "M12 14a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"],
  users: ["M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2", "M16 3.13a4 4 0 0 1 0 7.75", "M21 21v-2a4 4 0 0 0 -3 -3.85"],
  "building-factory": ["M4 21c1.147 -4.02 1.983 -8.027 2 -12h6c.017 3.973 .853 7.98 2 12", "M12.5 13h4.5c.025 2.612 .894 5.296 2 8", "M9 5a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1", "M3 21l19 0"],
  "file-export": ["M14 3v4a1 1 0 0 0 1 1h4", "M11.5 21h-4.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v5m-5 6h7m-3 -3l3 3l-3 3"],
  "arrow-right": ["M5 12l14 0", "M13 18l6 -6", "M13 6l6 6"],
  "arrow-down": ["M12 5l0 14", "M18 13l-6 6", "M6 13l6 6"],
  send: ["M10 14l11 -11", "M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5"],
  dashboard: ["M4 4h6v8h-6z", "M4 16h6v4h-6z", "M14 12h6v8h-6z", "M14 4h6v4h-6z"],
  "shopping-cart": ["M6 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M17 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M17 17h-11v-14h-2", "M6 5l14 1l-1 7h-13"],
  truck: ["M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5"],
  box: ["M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5", "M12 12l8 -4.5", "M12 12l0 9", "M12 12l-8 -4.5"],
  "report-money": ["M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2", "M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z", "M14 11h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-2.5", "M12 17v1m0 -8v1"],
  "circle-check": ["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M9 12l2 2l4 -4"],
  sparkles: ["M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z"],
  tool: ["M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5"],
  "user-shield": ["M6 21v-2a4 4 0 0 1 4 -4h2", "M22 16c0 4 -2.5 6 -3.5 6s-3.5 -2 -3.5 -6c1 0 2.5 -.5 3.5 -1.5c1 1 2.5 1.5 3.5 1.5z", "M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"],
  signature: ["M3 17c3.333 -3.333 5 -6 5 -8c0 -3 -1 -3 -2 -3s-2.032 1.085 -2 3c.034 2.048 1.658 4.877 2.5 6c1.5 2 2.5 2.5 3.5 1l2 -3c.333 2.667 1.333 4 3 4c.53 0 2.639 -2 3 -2c.517 0 1.517 .667 3 2"],
  "list-details": ["M13 5h8", "M13 9h5", "M13 15h8", "M13 19h5", "M3 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z", "M3 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"],
  "receipt": ["M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2m4 -14h6m-6 4h6m-2 4h2"],
} as const;

export type AiraIconName = keyof typeof PATHS;

type AiraIconProps = {
  name: AiraIconName;
  className?: string;
};

export function AiraIcon({ name, className = "" }: AiraIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon icon-tabler icons-tabler-outline icon-tabler-${name} ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
