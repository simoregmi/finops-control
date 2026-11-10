"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { api, fieldErrors } from "@/lib/api-client";
import type { Flag } from "@/lib/types";
import { FlagFields, toPayload, type FlagFormValues } from "../FlagForm";

export function NewFlagForm() {
  const router = useRouter();
  const [values, setValues] = useState<FlagFormValues>({ key: "", name: "", description: "", owner: "", tags: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api<Flag>("POST", "/api/flags", { key: values.key, ...toPayload(values) });
    setBusy(false);
    if (res.ok) {
      router.push(`/flags/${res.data.key}`);
      router.refresh();
      return;
    }
    setErrors(fieldErrors(res.error));
    setMessage(res.error.message);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      {message && <Alert tone="error">{message}</Alert>}
      <FlagFields values={values} onChange={setValues} errors={errors} keyEditable disabled={busy} />
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create flag"}</Button>
      </div>
    </form>
  );
}
