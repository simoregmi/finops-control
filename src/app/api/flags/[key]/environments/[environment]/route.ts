import type { NextRequest } from "next/server";
import { requestProductionChange } from "@/server/approvals";
import { getDb } from "@/server/db";
import { setFlagEnvironment } from "@/server/flags";
import { actorFrom, handle, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string; environment: string }> };

// Production returns 202 with a pending change request; other environments apply immediately.
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { key, environment } = await params;
  if (environment === "production") {
    return handle(async () => requestProductionChange(getDb(), actorFrom(req), key, await readJson(req)), 202);
  }
  return handle(async () => setFlagEnvironment(getDb(), actorFrom(req), key, environment, await readJson(req)));
}
