/*
 * AIRA "Lipat Δ" mark + wordmark (assets/branding/aira-delta/README.md):
 * Tiga bilah rata yang saling menindih membentuk huruf A di atas segitiga tegak (Δ).
 * Bilah biru (kaki kiri) = agen (#3D8BE0).
 * Bilah navy / putih (kaki kanan) = manusia (#1B2B48 / #FFFFFF).
 * Bilah tengah (crossbar) = Tool Layer (#2E5CA8 / #9CC9F5).
 */

type MarkProps = { size?: number; negative?: boolean; className?: string };

export function AiraMark({ size = 28, negative = false, className }: MarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
      role="img"
    >
      <path fill="#3D8BE0" d="M36.0 446.5L137.6 446.5L252.0 248.5L201.1 160.5Z" />
      <path fill={negative ? "#9CC9F5" : "#2E5CA8"} d="M398.3 312.0L223.4 312.0L189.9 370.0L431.8 370.0Z" />
      <path
        fill={negative ? "#FFFFFF" : "#1B2B48"}
        d="M205.2 153.5L292.7 305.0L394.3 305.0L256.0 65.5ZM374.4 446.5L476.0 446.5L435.9 377.0L334.3 377.0Z"
      />
    </svg>
  );
}

type LogoProps = { negative?: boolean; className?: string };

export function AiraLogo({ negative = false, className }: LogoProps) {
  return (
    <span className={`aira-logo${negative ? " aira-logo--negative" : ""}${className ? ` ${className}` : ""}`}>
      <AiraMark size={30} negative={negative} />
      <span className="aira-logo__word" aria-label="AIRA">
        <span className="aira-logo__ai">AI</span>RA
      </span>
    </span>
  );
}
