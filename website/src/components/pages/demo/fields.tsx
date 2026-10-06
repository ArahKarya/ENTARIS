import type { ReactNode } from "react";
import { CHANNEL_LABELS, type Channel } from "./demoLogic";

/* Small form controls for the "Minta demo" intake form (label + control + inline error). */

type FieldShellProps = { id: string; label: string; optional?: boolean; error?: string; wide?: boolean; children: ReactNode };

function FieldShell({ id, label, optional, error, wide, children }: FieldShellProps) {
  return (
    <div className={`demo-field${wide ? " demo-field--wide" : ""}`} data-invalid={error ? "true" : undefined}>
      <label htmlFor={id}>
        {label}
        {optional ? <span className="demo-field__optional"> (opsional)</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="demo-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, error?: string) => (error ? `${id}-error` : undefined);

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "tel";
  autoComplete?: string;
  optional?: boolean;
  error?: string;
  wide?: boolean;
  multiline?: boolean;
};

export function TextField({ id, label, value, onChange, type = "text", autoComplete, optional, error, wide, multiline }: TextFieldProps) {
  const common = { id, name: id, value, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy(id, error) };
  return (
    <FieldShell id={id} label={label} optional={optional} error={error} wide={wide}>
      {multiline ? (
        <textarea {...common} rows={4} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input {...common} type={type} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} />
      )}
    </FieldShell>
  );
}

type SelectFieldProps = {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  optional?: boolean;
  error?: string;
};

export function SelectField({ id, label, value, options, onChange, optional, error }: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} optional={optional} error={error}>
      <select id={id} name={id} value={value} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error)} onChange={(event) => onChange(event.target.value)}>
        <option value="">Pilih…</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

type ChannelFieldProps = { value: Channel | ""; onChange: (value: Channel) => void; error?: string };

export function ChannelField({ value, onChange, error }: ChannelFieldProps) {
  return (
    <fieldset className="demo-field demo-field--wide demo-channel" data-invalid={error ? "true" : undefined} aria-describedby={describedBy("channel", error)}>
      <legend>Ingin dihubungi lewat</legend>
      <div className="demo-channel__options">
        {(Object.keys(CHANNEL_LABELS) as Channel[]).map((channel) => (
          <label key={channel} className="demo-channel__option">
            <input type="radio" name="channel" value={channel} checked={value === channel} onChange={() => onChange(channel)} />
            <span>{CHANNEL_LABELS[channel]}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p id="channel-error" className="demo-field__error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
