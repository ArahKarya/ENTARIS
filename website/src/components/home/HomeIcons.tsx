import type { CSSProperties } from "react";

/** Tabler outline icon paths used on the home page. */
const PATHS = {
  adjustments: ["M4 10a2 2 0 1 0 4 0a2 2 0 0 0 -4 0", "M6 4v4", "M6 12v8", "M10 16a2 2 0 1 0 4 0a2 2 0 0 0 -4 0", "M12 4v10", "M12 18v2", "M16 7a2 2 0 1 0 4 0a2 2 0 0 0 -4 0", "M18 4v1", "M18 9v11"],
  devices: ["M13 9a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-10z", "M18 8v-3a1 1 0 0 0 -1 -1h-13a1 1 0 0 0 -1 1v12a1 1 0 0 0 1 1h9", "M16 9h2"],
  certificate: ["M15 15m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M13 17.5v4.5l2 -1.5l2 1.5v-4.5", "M10 19h-5a2 2 0 0 1 -2 -2v-10c0 -1.1 .9 -2 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -1 1.73", "M6 9l12 0", "M6 12l3 0", "M6 15l2 0"],
  trendingUp: ["M3 17l6 -6l4 4l8 -8", "M14 7l7 0l0 7"],
  sales: ["M6 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M17 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M17 17h-11v-14h-2", "M6 5l14 1l-1 7h-13"],
  purchase: [
    "M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M5 17h-2v-4m-1 -8h11v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5",
    "M3 9l4 0",
  ],
  inventory: ["M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5", "M12 12l8 -4.5", "M12 12l0 9", "M12 12l-8 -4.5"],
  production: [
    "M3 21h18",
    "M5 21v-12l5 4v-4l5 4h4",
    "M19 21v-8l-1.436 -9.574a.5 .5 0 0 0 -.495 -.426h-1.145a.5 .5 0 0 0 -.494 .418l-1.43 8.582",
    "M9 17h1",
    "M14 17h1",
  ],
  finance: ["M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0", "M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0", "M3 6l0 13", "M12 6l0 13", "M21 6l0 13"],
  asset: ["M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5"],
  arrowRight: ["M5 12l14 0", "M13 18l6 -6", "M13 6l6 6"],
  userCheck: ["M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0", "M6 21v-2a4 4 0 0 1 4 -4h4", "M15 19l2 2l4 -4"],
  check: ["M5 12l5 5l10 -10"],
  search: ["M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M21 21l-6 -6"],
  copy: [
    "M8 8m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z",
    "M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2",
  ],
  terminal: ["M5 7l5 5l-5 5", "M12 19l7 0"],
  externalLink: ["M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6", "M11 13l9 -9", "M15 4h5v5"],
  x: ["M18 6l-12 12", "M6 6l12 12"],
  chevronLeft: ["M15 6l-6 6l6 6"],
  chevronRight: ["M9 6l6 6l-6 6"],
  layers: ["M12 4l-8 4l8 4l8 -4l-8 -4", "M4 12l8 4l8 -4", "M4 16l8 4l8 -4"],
} as const;

export type IconName = keyof typeof PATHS;

type IconProps = { name: IconName; className?: string; style?: CSSProperties };

export function Icon({ name, className = "", style }: IconProps) {
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
      className={`icon icon-tabler icons-tabler-outline ${className}`.trim()}
      style={style}
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
