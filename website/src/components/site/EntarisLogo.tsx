/*
 * Entaris "Anyaman ∇" mark + wordmark (docs/brand/entaris/README.md): three interlocking bars
 * forming an inverted triangle; the wordmark is wide caps with "TA" in blue.
 */

type MarkProps = { size?: number; negative?: boolean; className?: string };

export function EntarisMark({ size = 28, negative = false, className }: MarkProps) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <path fill="#3D8BE0" d="M306.8 358.5L256.0 270.5L256.0 270.5L192.5 160.5L90.8 160.5L256.0 446.5Z" />
      <path fill={negative ? "#FFFFFF" : "#1B2B48"} d="M86.8 153.5L188.4 153.5L315.5 153.5L317.5 150.0L366.3 65.5L36.0 65.5Z" />
      <path fill={negative ? "#9CC9F5" : "#2E5CA8"} d="M374.4 65.5L323.6 153.5L323.6 153.5L260.0 263.5L262.1 267.0L310.8 351.5L476.0 65.5Z" />
    </svg>
  );
}

type LogoProps = { negative?: boolean; className?: string };

export function EntarisLogo({ negative = false, className }: LogoProps) {
  return (
    <span className={`ent-logo${negative ? " ent-logo--negative" : ""}${className ? ` ${className}` : ""}`}>
      <EntarisMark size={30} negative={negative} />
      <span className="ent-logo__word" aria-label="Entaris">
        EN<span className="ent-logo__ta">TA</span>RIS
      </span>
    </span>
  );
}
