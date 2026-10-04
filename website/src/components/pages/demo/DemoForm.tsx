"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { DemoConfirmation } from "./DemoConfirmation";
import {
  EMPTY_VALUES,
  INDUSTRY_OPTIONS,
  SIZE_OPTIONS,
  SYSTEM_OPTIONS,
  validate,
  type DemoErrors,
  type DemoField,
  type DemoValues,
} from "./demoLogic";
import { ChannelField, SelectField, TextField } from "./fields";

/** First invalid field in on-screen order, so focus can move to it after a failed submit. */
const FIELD_ORDER: readonly DemoField[] = ["name", "company", "role", "industry", "size", "currentSystem", "email", "whatsapp", "channel", "wishes"];

export function DemoForm() {
  const [values, setValues] = useState<DemoValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<DemoErrors>({});
  const [step, setStep] = useState<"form" | "confirm">("form");
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step === "confirm") headingRef.current?.focus();
  }, [step]);

  const set = (field: DemoField) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    const firstInvalid = FIELD_ORDER.find((field) => found[field]);
    if (firstInvalid) {
      const target = firstInvalid === "channel" ? "input[name=channel]" : `[name=${firstInvalid}]`;
      formRef.current?.querySelector<HTMLElement>(target)?.focus();
      return;
    }
    setStep("confirm");
  };

  if (step === "confirm") return <DemoConfirmation values={values} headingRef={headingRef} onEdit={() => setStep("form")} />;

  return (
    <form ref={formRef} className="demo-card demo-form" noValidate onSubmit={onSubmit}>
      <div className="demo-form__grid">
        <TextField id="name" label="Nama lengkap" value={values.name} onChange={set("name")} autoComplete="name" error={errors.name} />
        <TextField id="company" label="Nama perusahaan" value={values.company} onChange={set("company")} autoComplete="organization" error={errors.company} />
        <TextField id="role" label="Jabatan" value={values.role} onChange={set("role")} autoComplete="organization-title" optional />
        <SelectField id="industry" label="Bidang usaha" value={values.industry} options={INDUSTRY_OPTIONS} onChange={set("industry")} error={errors.industry} />
        <SelectField id="size" label="Jumlah karyawan" value={values.size} options={SIZE_OPTIONS} onChange={set("size")} error={errors.size} />
        <SelectField id="currentSystem" label="Sistem yang dipakai sekarang" value={values.currentSystem} options={SYSTEM_OPTIONS} onChange={set("currentSystem")} optional />
        <TextField id="email" label="Email" type="email" value={values.email} onChange={set("email")} autoComplete="email" error={errors.email} />
        <TextField id="whatsapp" label="Nomor WhatsApp" type="tel" value={values.whatsapp} onChange={set("whatsapp")} autoComplete="tel" error={errors.whatsapp} />
        <ChannelField value={values.channel} onChange={set("channel")} error={errors.channel} />
        <TextField id="wishes" label="Yang ingin dilihat saat demo" value={values.wishes} onChange={set("wishes")} optional wide multiline />
      </div>
      <p className="demo-form__note">
        Data Anda hanya dipakai untuk menyiapkan dan menjadwalkan demo. Isian ini tidak disimpan di website; hanya dikirim saat Anda menekan tombol WhatsApp atau Email di langkah berikutnya.
      </p>
      <button type="submit" className="ent-btn ent-btn--solid demo-form__submit">
        Lanjutkan →
      </button>
    </form>
  );
}
