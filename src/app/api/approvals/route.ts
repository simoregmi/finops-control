import type { NextRequest } from "next/server";
import { listProductionChangeRequests } from "@/server/approvals";
import { getDb } from "@/server/db";
import { handle } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return handle(() =>
    listProductionChangeRequests(getDb(), {
      status: sp.get("status") || undefined,
      flag: sp.get("flag") || undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    }),
  );
}
