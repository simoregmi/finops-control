import type { NextRequest } from "next/server";
import { getDb } from "@/server/db";
import { getFlag, updateFlag } from "@/server/flags";
import { actorFrom, handle, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { key } = await params;
  return handle(() => getFlag(getDb(), key));
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { key } = await params;
  return handle(async () => updateFlag(getDb(), actorFrom(req), key, await readJson(req)));
}
