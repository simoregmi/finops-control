import { listProductionChangeRequests } from "@/server/approvals";
import { currentActorForDisplay } from "@/server/current-actor";
import { getDb } from "@/server/db";
import { ApprovalQueue } from "./ApprovalQueue";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const db = getDb();
  const actor = await currentActorForDisplay();
  const pending = listProductionChangeRequests(db, { status: "pending" });
  const resolved = listProductionChangeRequests(db, { status: "all", limit: 50 }).filter((r) => r.status !== "pending").slice(0, 20);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="text-sm text-slate-500">
          Production flag changes take effect only after a second person approves them. Requesters cannot approve their own
          requests; the server enforces this. Identities are simulated (header selector), not authentication.
        </p>
      </div>
      <ApprovalQueue actor={actor} pending={pending} resolved={resolved} />
    </div>
  );
}
