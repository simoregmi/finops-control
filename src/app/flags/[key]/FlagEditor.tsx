"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api, fieldErrors, type ApiResult } from "@/lib/api-client";
import { ENVIRONMENTS, type Environment, type Flag } from "@/lib/types";
import { FlagFields, toPayload, type FlagFormValues } from "../FlagForm";

function toValues(f: Flag): FlagFormValues {
  return { key: f.key, name: f.name, description: f.description, owner: f.owner, tags: f.tags.join(", ") };
}

type Notice = { tone: "error" | "success" | "warning"; text: string; conflict?: boolean };

export function FlagEditor({ initial }: { initial: Flag }) {
  const router = useRouter();
  const [flag, setFlag] = useState(initial);
  const [values, setValues] = useState(toValues(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingProd, setPendingProd] = useState<boolean | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  function apply(res: ApiResult<Flag>, successText: string) {
    if (res.ok) {
      setFlag(res.data);
      setValues(toValues(res.data));
      setErrors({});
      setNotice({ tone: "success", text: successText });
      router.refresh();
      return true;
    }
    setErrors(fieldErrors(res.error));
    setNotice({ tone: res.status === 409 ? "warning" : "error", text: res.error.message, conflict: res.error.code === "VERSION_CONFLICT" });
    return false;
  }

  async function saveMetadata(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api<Flag>("PATCH", `/api/flags/${flag.key}`, { ...toPayload(values), expectedVersion: flag.version });
    setBusy(false);
    apply(res, "Metadata saved");
  }

  async function toggle(env: Environment, enabled: boolean, confirmProduction?: string) {
    setBusy(true);
    const res = await api<Flag>("PUT", `/api/flags/${flag.key}/environments/${env}`, {
      enabled,
      expectedVersion: flag.version,
      ...(confirmProduction !== undefined ? { confirmProduction } : {}),
    });
    setBusy(false);
    setPendingProd(null);
    apply(res, `${enabled ? "Enabled" : "Disabled"} in ${env}`);
  }

  async function archive() {
    setBusy(true);
    const res = await api<Flag>("POST", `/api/flags/${flag.key}/archive`, { expectedVersion: flag.version });
    setBusy(false);
    setConfirmArchive(false);
    apply(res, "Flag archived");
  }

  const readOnly = flag.archived || busy;

  return (
    <div className="space-y-6">
      {notice && (
        <Alert tone={notice.tone}>
          <div className="flex items-center justify-between gap-3">
            <span>{notice.text}</span>
            {notice.conflict && (
              <Button variant="secondary" onClick={() => window.location.reload()}>Reload latest</Button>
            )}
          </div>
        </Alert>
      )}
      {flag.archived && <Alert tone="warning">This flag is archived and read-only. Its history is preserved below.</Alert>}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Environments</h2>
          <span className="font-mono text-xs text-slate-500">version v{flag.version}</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ENVIRONMENTS.map((env) => {
            const on = flag.environments[env];
            return (
              <div key={env} className={`flex items-center justify-between rounded-md border p-3 ${env === "production" ? "border-red-200 bg-red-50/40" : "border-slate-200"}`}>
                <div className="space-y-1">
                  <div className="text-sm font-medium capitalize">{env}</div>
                  <StatusBadge enabled={on} label={on ? "Enabled" : "Disabled"} />
                </div>
                <Button
                  variant={on ? "secondary" : env === "production" ? "danger" : "primary"}
                  disabled={readOnly}
                  onClick={() => (env === "production" ? setPendingProd(!on) : toggle(env, !on))}
                  aria-label={`${on ? "Disable" : "Enable"} in ${env}`}
                >
                  {on ? "Disable" : "Enable"}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">Production changes require typing the flag key; the server rejects production changes without it.</p>
      </section>

      <form onSubmit={saveMetadata} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Details</h2>
        <FlagFields values={values} onChange={setValues} errors={errors} keyEditable={false} disabled={readOnly} />
        <div className="flex items-center justify-between">
          <Button type="button" variant="secondary" disabled={readOnly} onClick={() => setConfirmArchive(true)}>Archive flag</Button>
          <Button type="submit" disabled={readOnly}>{busy ? "Saving…" : "Save details"}</Button>
        </div>
      </form>

      <ConfirmDialog
        open={pendingProd !== null}
        title={`${pendingProd ? "Enable" : "Disable"} in production?`}
        confirmLabel={pendingProd ? "Enable in production" : "Disable in production"}
        confirmPhrase={flag.key}
        danger
        busy={busy}
        onCancel={() => setPendingProd(null)}
        onConfirm={(typed) => toggle("production", pendingProd!, typed)}
      >
        <p>
          This changes <strong>production</strong> behaviour of <code className="font-mono">{flag.key}</code> (simulated: no real rollout happens).
        </p>
        <p>The change will be recorded in the audit log under your simulated identity.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmArchive}
        title="Archive this flag?"
        confirmLabel="Archive"
        busy={busy}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={archive}
      >
        <p>Archived flags are read-only and hidden from the default list. They are never deleted, and the key cannot be reused.</p>
        <p>The flag must be disabled in all environments first.</p>
      </ConfirmDialog>
    </div>
  );
}
