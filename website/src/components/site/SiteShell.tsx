import { ErpRoot } from "@/components/erp/shared/ErpRoot";
import { SiteFooter } from "./SiteFooter";
import { SiteNav } from "./SiteNav";

type SiteShellProps = {
  children: React.ReactNode;
  /** The home page keeps the ported `data-home-category-view` state on the root. */
  home?: boolean;
};

/** Page frame shared by every route: themed root, floating nav, page content, footer. */
export function SiteShell({ children, home = false }: SiteShellProps) {
  return (
    <ErpRoot home={home}>
      <SiteNav home={home} />
      {children}
      <SiteFooter />
    </ErpRoot>
  );
}
