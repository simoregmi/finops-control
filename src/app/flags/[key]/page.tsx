import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTable } from "@/components/AuditTable";
import { listProductionChangeRequests } from "@/server/approvals";
import { listAuditEvents } from "@/server/audit";
import { getDb } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { getFlag } from "@/server/flags";
import { FlagEditor } from "./FlagEditor";

export const dynamic = "force-dynamic";

export default async function FlagPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = getDb();
  let flag;
  try {
    flag = getFlag(db, key);
  } catch (e) {
    if (e instanceof ServiceError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const events = listAuditEvents(db, { flag: key, limit: 50 });
  const [pendingRequest = null] = listProductionChangeRequests(db, { status: "pending", flag: key });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/flags" className="text-sm text-slate-500 hover:underline">← All flags</Link>
        <h1 className="mt-1 font-mono text-2xl font-semibold">{flag.key}</h1>
        <p className="text-sm text-slate-500">{flag.name}</p>
      </div>
      <FlagEditor key={flag.key} initial={flag} pendingRequest={pendingRequest} />
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">History</h2>
          <Link href={`/audit?flag=${flag.key}`} className="text-sm text-indigo-700 hover:underline">Open in audit log</Link>
        </div>
        <AuditTable events={events} showResource={false} />
      </section>
    </div>
  );
}
