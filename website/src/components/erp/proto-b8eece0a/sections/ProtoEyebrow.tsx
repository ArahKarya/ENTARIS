type ProtoEyebrowProps = {
  name: string;
  context: string;
};

/** `.proto-section-eyebrow--underline` — identical DOM in every proto section. */
export function ProtoEyebrow({ name, context }: ProtoEyebrowProps) {
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

/** Tabler arrow-right with the `ui-icon` class (hero ghost CTA + example cards). */
export function ArrowRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-right ui-icon" data-icon="arrow-right" aria-hidden="true" focusable="false">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M5 12l14 0" />
      <path d="M13 18l6 -6" />
      <path d="M13 6l6 6" />
    </svg>
  );
}
