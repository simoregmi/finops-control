"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import { inputClass } from "./Field";

/**
 * Modal confirmation. When `confirmPhrase` is set the user must type it exactly,
 * and the typed value is passed to onConfirm so the server can verify it too.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  confirmPhrase,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  confirmPhrase?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: (typed: string) => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  if (!open) return null;
  const ready = !confirmPhrase || typed === confirmPhrase;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl">
        <h2 id="confirm-title" className="text-lg font-semibold">
          {title}
        </h2>
        <div className="space-y-2 text-sm text-slate-700">{children}</div>
        {confirmPhrase && (
          <label className="block space-y-1 text-sm">
            <span>
              Type <code className="rounded bg-slate-100 px-1 font-mono">{confirmPhrase}</code> to confirm
            </span>
            <input autoFocus className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Confirmation phrase" />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setTyped("");
              onCancel();
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={!ready || busy}
            onClick={() => {
              onConfirm(typed);
              setTyped("");
            }}
          >
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
