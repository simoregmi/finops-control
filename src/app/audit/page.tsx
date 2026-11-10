import Link from "next/link";
import { AuditTable } from "@/components/AuditTable";
import { inputClass } from "@/components/ui/Field";
import { listAuditActors, listAuditEvents } from "@/server/audit";
import { getDb } from "@/server/db";
import { listFlags } from "@/server/flags";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = getDb();
  const events = listAuditEvents(db, { flag: sp.flag || undefined, actor: sp.actor || undefined });
  const flagKeys = listFlags(db, { includeArchived: true }).map((f) => f.key);
  const actors = listAuditActors(db);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-slate-500">Read-only and append-only. Showing the latest {events.length} event{events.length === 1 ? "" : "s"}.</p>
      </div>
      <form method="get" className="grid grid-cols-1 items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-4">
        <select name="flag" defaultValue={sp.flag ?? ""} className={inputClass} aria-label="Flag">
          <option value="">All flags</option>
          {flagKeys.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select name="actor" defaultValue={sp.actor ?? ""} className={inputClass} aria-label="Actor">
          <option value="">All actors</option>
          {actors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="flex items-center gap-3">
          <button className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700" type="submit">Apply</button>
          <Link href="/audit" className="text-sm text-slate-600 hover:underline">Reset</Link>
        </div>
      </form>
      <AuditTable events={events} />
    </div>
  );
}
