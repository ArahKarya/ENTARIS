import type { CSSProperties } from "react";

/** Tabler outline icon paths used on the home page. */
const PATHS = {
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
  sparkles: [
    "M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z",
  ],
  check: ["M5 12l5 5l10 -10"],
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
