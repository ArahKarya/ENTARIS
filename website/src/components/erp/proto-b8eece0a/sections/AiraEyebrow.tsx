type AiraEyebrowProps = {
  name: string;
  context: string;
};

/** `.proto-section-eyebrow--underline`: the design system's section eyebrow. */
export function AiraEyebrow({ name, context }: AiraEyebrowProps) {
  return (
    <div className="proto-section-eyebrow proto-section-eyebrow--underline">
      <span className="proto-section-eyebrow__rail" aria-hidden="true" />
      <span className="proto-section-eyebrow__copy">
        <span className="proto-section-eyebrow__name">{name}</span>
        <span className="proto-section-eyebrow__context">{context}</span>
      </span>
    </div>
  );
}
