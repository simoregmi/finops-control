"use client";

import { Field, inputClass } from "@/components/ui/Field";

export interface FlagFormValues {
  key: string;
  name: string;
  description: string;
  owner: string;
  tags: string;
}

export function toPayload(v: FlagFormValues) {
  return {
    name: v.name,
    description: v.description,
    owner: v.owner,
    tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
  };
}

/** Shared create/edit fields. Key is editable only when creating; it is immutable afterwards. */
export function FlagFields({
  values,
  onChange,
  errors,
  keyEditable,
  disabled,
}: {
  values: FlagFormValues;
  onChange: (v: FlagFormValues) => void;
  errors: Record<string, string>;
  keyEditable: boolean;
  disabled?: boolean;
}) {
  const set = (k: keyof FlagFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...values, [k]: e.target.value });
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Key" hint={keyEditable ? "lowercase_snake_case, 3-64 chars. Cannot be changed later." : "Immutable: application code references flags by key."} error={errors.key}>
        <input className={`${inputClass} font-mono`} value={values.key} onChange={set("key")} disabled={!keyEditable || disabled} />
      </Field>
      <Field label="Name" error={errors.name}>
        <input className={inputClass} value={values.name} onChange={set("name")} disabled={disabled} />
      </Field>
      <Field label="Owner team" hint="Team slug, e.g. payments-platform" error={errors.owner}>
        <input className={inputClass} value={values.owner} onChange={set("owner")} disabled={disabled} />
      </Field>
      <Field label="Tags" hint="Comma-separated, e.g. payments, risk" error={errors.tags ?? errors["tags.0"]}>
        <input className={inputClass} value={values.tags} onChange={set("tags")} disabled={disabled} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Description" hint="Up to 500 characters" error={errors.description}>
          <textarea className={inputClass} rows={3} value={values.description} onChange={set("description")} disabled={disabled} />
        </Field>
      </div>
    </div>
  );
}
