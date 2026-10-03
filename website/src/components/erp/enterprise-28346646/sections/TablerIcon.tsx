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
