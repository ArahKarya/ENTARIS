import type { CSSProperties } from "react";
import { Icon } from "./HomeIcons";
import type { ModuleCategory } from "./homeContent";

type ModuleCardProps = {
  category: ModuleCategory;
  name: string;
  desc: string;
  index: number;
  onClick?: () => void;
};

/**
 * Gallery card without photography: a tinted category color, a subtle CSS pattern and a large
 * category glyph. Cards are interactive, opening module details when clicked.
 */
export function ModuleCard({ category, name, desc, index, onClick }: ModuleCardProps) {
  const style = {
    "--card-bg": category.color,
    "--card-fg": "#fff",
    "--catalog-taxonomy-accent": category.color,
    "--catalog-card-index": String(index),
  } as CSSProperties;

  return (
    <article
      className="catalog-card catalog-card--landscape home-module-card is-interactive"
      style={style}
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="home-module-card__tint absolute inset-0 pointer-events-none" aria-hidden="true" />
      <div className={`absolute inset-0 pointer-events-none ${category.pattern}`} aria-hidden="true" />
      <Icon name={category.icon} className="home-module-card__glyph" />
      <div className="catalog-card__rest-copy">
        <span className="catalog-card-category-pill catalog-card-category-pill--rest home-module-card__pill">{category.label}</span>
        <h4 className="catalog-card__title">{name}</h4>
        <p className="catalog-card__desc">{desc}</p>
      </div>
    </article>
  );
}
