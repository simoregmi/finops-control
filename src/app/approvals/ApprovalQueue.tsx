"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api-client";
import type { ProductionChangeRequest } from "@/lib/types";

const time = (iso: string | null) => (iso ? iso.replace("T", " ").slice(0, 19) : "—");

function Change({ r }: { r: ProductionChangeRequest }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="font-medium">production:</span>
      <StatusBadge enabled={r.previousEnabled} />
      <span aria-hidden>→</span>
      <StatusBadge enabled={r.requestedEnabled} />
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  pending: "bg-amber-100 text-amber-900",
};

function StatusPill({ status }: { status: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[status] ?? ""}`}>{status}</span>;
}

type Decision = { request: ProductionChangeRequest; action: "approve" | "reject" };

export function ApprovalQueue({ actor, pending, resolved }: { actor: string; pending: ProductionChangeRequest[]; resolved: ProductionChangeRequest[] }) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "warning"; text: string } | null>(null);

  async function decide() {
    if (!decision) return;
    const { request, action } = decision;
    setBusy(true);
    const res = await api("POST", `/api/approvals/${request.id}/${action}`);
    setBusy(false);
    setDecision(null);
    if (res.ok) {
      setNotice({
        tone: "success",
        text:
          action === "approve"
            ? `Approved request #${request.id}: ${request.flagKey} is now ${request.requestedEnabled ? "enabled" : "disabled"} in production.`
            : `Rejected request #${request.id}. ${request.flagKey} was not changed.`,
      });
    } else {
      setNotice({ tone: res.status === 409 ? "warning" : "error", text: `${res.error.message} (HTTP ${res.status})` });
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <Alert tone="info">
        Reviewing as <strong>{actor}</strong> (simulated identity). Switch identity in the header to act as a different person.
      </Alert>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Pending production changes ({pending.length})</h2>
        <DataTable
          rows={pending}
          rowKey={(r) => r.id}
          empty="No pending production changes."
          columns={[
            { header: "#", cell: (r) => <span className="font-mono text-xs">#{r.id}</span> },
            {
              header: "Flag",
              cell: (r) => (
                <div>
                  <Link className="font-mono text-sm text-indigo-700 hover:underline" href={`/flags/${r.flagKey}`}>{r.flagKey}</Link>
                  <div className="text-xs text-slate-500">{r.flagName}</div>
                </div>
              ),
            },
            {
              header: "Requested change",
              cell: (r) => (
                <div className="space-y-1">
                  <Change r={r} />
                  {r.stale && (
                    <div className="text-xs text-amber-800">
                      Stale: flag changed since submission (v{r.baseVersion} → v{r.currentFlagVersion}). Can only be rejected.
                    </div>
                  )}
                </div>
              ),
            },
            { header: "Requester", cell: (r) => <span className="text-xs">{r.requestedBy}</span> },
            { header: "Submitted (UTC)", cell: (r) => <span className="whitespace-nowrap font-mono text-xs">{time(r.requestedAt)}</span> },
            {
              header: "Decision",
              cell: (r) => {
                const own = r.requestedBy === actor;
                return (
                  <div className="space-y-1">
                    <div className="flex gap-2">
                      <Button
                        disabled={busy || own || r.stale}
                        title={own ? "You requested this change. A different person must approve it." : undefined}
                        onClick={() => setDecision({ request: r, action: "approve" })}
                        aria-label={`Approve request ${r.id}`}
                      >
                        Approve
                      </Button>
                      <Button variant="secondary" disabled={busy} onClick={() => setDecision({ request: r, action: "reject" })} aria-label={`Reject request ${r.id}`}>
                        {own ? "Withdraw" : "Reject"}
                      </Button>
                    </div>
                    {own && <div className="text-xs text-slate-500">Your request: needs another approver.</div>}
                  </div>
                );
              },
            },
          ]}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Recently decided</h2>
        <DataTable
          rows={resolved}
          rowKey={(r) => r.id}
          empty="No decisions yet."
          columns={[
            { header: "#", cell: (r) => <span className="font-mono text-xs">#{r.id}</span> },
            { header: "Flag", cell: (r) => <Link className="font-mono text-sm text-indigo-700 hover:underline" href={`/flags/${r.flagKey}`}>{r.flagKey}</Link> },
            { header: "Change", cell: (r) => <Change r={r} /> },
            { header: "Status", cell: (r) => <StatusPill status={r.status} /> },
            { header: "Requester", cell: (r) => <span className="text-xs">{r.requestedBy}</span> },
            { header: "Reviewer", cell: (r) => <span className="text-xs">{r.reviewedBy}</span> },
            { header: "Decided (UTC)", cell: (r) => <span className="whitespace-nowrap font-mono text-xs">{time(r.reviewedAt)}</span> },
          ]}
        />
      </section>

      <ConfirmDialog
        open={decision !== null}
        title={decision?.action === "approve" ? `Approve request #${decision?.request.id}?` : `Reject request #${decision?.request.id}?`}
        confirmLabel={decision?.action === "approve" ? "Approve and apply" : "Reject"}
        danger={decision?.action === "approve"}
        busy={busy}
        onCancel={() => setDecision(null)}
        onConfirm={decide}
      >
        {decision && (
          <>
            <p>
              <code className="font-mono">{decision.request.flagKey}</code> in <strong>production</strong>:{" "}
              {decision.request.requestedEnabled ? "enable" : "disable"} (requested by {decision.request.requestedBy}).
            </p>
            <p>
              {decision.action === "approve"
                ? "The change is applied immediately (simulated: no real rollout happens) and recorded in the audit log."
                : "The flag stays unchanged. The rejection is recorded in the audit log."}
            </p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
