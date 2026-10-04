import Link from "next/link";
import { ARROW_RIGHT_PATHS, BUTTON_ICON_STYLE, TablerIcon } from "./TablerIcon";

export type CtaSpec = { label: string; href: string; arrow?: boolean };

type CtaLinkProps = { cta: CtaSpec; variant: "primary" | "ghost"; size: "lg" | "xl" };

/** Button-styled link: in-page `#anchors` stay plain anchors, everything else is a client-side Link. */
export function CtaLink({ cta, variant, size }: CtaLinkProps) {
  const className = `btn btn--${variant} btn--${size}`;
  const content = (
    <>
      {cta.label}
      {cta.arrow ? <TablerIcon name="arrow-right" dataIcon="arrow-right" paths={ARROW_RIGHT_PATHS} style={BUTTON_ICON_STYLE} /> : null}
    </>
  );
  return cta.href.startsWith("#") ? (
    <a href={cta.href} className={className}>
      {content}
    </a>
  ) : (
    <Link href={cta.href} className={className}>
      {content}
    </Link>
  );
}
