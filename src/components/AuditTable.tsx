import Link from "next/link";
import type { AuditEvent } from "@/lib/types";
import { DataTable } from "./ui/DataTable";

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  return <code className="block max-w-xs whitespace-pre-wrap break-all font-mono text-xs text-slate-700">{JSON.stringify(value)}</code>;
}

export function AuditTable({ events, showResource = true }: { events: AuditEvent[]; showResource?: boolean }) {
  return (
    <DataTable
      rows={events}
      rowKey={(e) => e.id}
      empty="No audit events yet. Changes you make will appear here."
      columns={[
        { header: "Time (UTC)", cell: (e) => <span className="whitespace-nowrap font-mono text-xs">{e.createdAt.replace("T", " ").slice(0, 19)}</span> },
        { header: "Actor", cell: (e) => <span className="text-xs">{e.actor}</span> },
        { header: "Action", cell: (e) => <span className="font-mono text-xs">{e.action}</span> },
        ...(showResource
          ? [{ header: "Resource", cell: (e: AuditEvent) => <Link className="font-mono text-xs text-indigo-700 hover:underline" href={`/flags/${e.resourceKey}`}>{e.resourceKey}</Link> }]
          : []),
        { header: "Env", cell: (e) => <span className="text-xs">{e.environment ?? "—"}</span> },
        { header: "Old value", cell: (e) => <Json value={e.oldValue} /> },
        { header: "New value", cell: (e) => <Json value={e.newValue} /> },
      ]}
    />
  );
}
