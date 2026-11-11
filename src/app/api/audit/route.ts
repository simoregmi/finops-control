import type { NextRequest } from "next/server";
import { listAuditEvents } from "@/server/audit";
import { getDb } from "@/server/db";
import { handle } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return handle(() =>
    listAuditEvents(getDb(), {
      flag: sp.get("flag") || undefined,
      actor: sp.get("actor") || undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    }),
  );
}
