type SectionEyebrowProps = { name: string; context?: string };

/** Rail + label used above section headings (design-system eyebrow). */
export function SectionEyebrow({ name, context }: SectionEyebrowProps) {
  return (
    <div className="proto-section-eyebrow">
      <span className="proto-section-eyebrow__rail" aria-hidden="true" />
      <span className="proto-section-eyebrow__copy">
        <span className="proto-section-eyebrow__name">{name}</span>
        {context ? <span className="proto-section-eyebrow__context">{context}</span> : null}
      </span>
    </div>
  );
}
