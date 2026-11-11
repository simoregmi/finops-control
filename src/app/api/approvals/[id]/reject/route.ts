import type { NextRequest } from "next/server";
import { rejectProductionChange } from "@/server/approvals";
import { getDb } from "@/server/db";
import { actorFrom, handle } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return handle(() => rejectProductionChange(getDb(), actorFrom(req), id));
}
