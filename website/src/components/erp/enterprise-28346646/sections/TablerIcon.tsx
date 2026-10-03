/*
 * Tabler outline icon markup exactly as the source renders it (icons.js output): the shared
 * <svg> attributes, the invisible bounding path, then the glyph paths.
 */
export type TablerIconProps = {
  /** Tabler slug used in the `icon-tabler-<name>` class. */
  name: string;
  /** Value of the source's data-icon attribute (may differ from the slug, e.g. scroll-text). */
  dataIcon: string;
  paths: readonly string[];
  extraClass?: string;
  style?: React.CSSProperties;
};

export function TablerIcon({ name, dataIcon, paths, extraClass, style }: TablerIconProps) {
  const className = `icon icon-tabler icons-tabler-outline icon-tabler-${name}${extraClass ? ` ${extraClass}` : ""}`;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} data-icon={dataIcon} aria-hidden="true" focusable="false">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export const ARROW_RIGHT_PATHS = ["M5 12l14 0", "M13 18l6 -6", "M13 6l6 6"] as const;

export const BUTTON_ICON_STYLE: React.CSSProperties = { width: "16px", height: "16px" };

export const LOCK_PATHS = [
  "M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6",
  "M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0",
  "M8 11v-4a4 4 0 1 1 8 0v4",
] as const;

export const DATABASE_PATHS = [
  "M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0",
  "M4 6v6a8 3 0 0 0 16 0v-6",
  "M4 12v6a8 3 0 0 0 16 0v-6",
] as const;

export const SCROLL_PATHS = [
  "M17 20h-11a3 3 0 0 1 0 -6h11a3 3 0 0 0 0 6h1a3 3 0 0 0 3 -3v-11a2 2 0 0 0 -2 -2h-10a2 2 0 0 0 -2 2v8",
] as const;

export const SERVER_PATHS = [
  "M3 7a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v2a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3",
  "M3 15a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v2a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3l0 -2",
  "M7 8l0 .01",
  "M7 16l0 .01",
] as const;
