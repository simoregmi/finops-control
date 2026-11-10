import type { NextRequest } from "next/server";
import { getDb } from "@/server/db";
import { archiveFlag } from "@/server/flags";
import { actorFrom, handle, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { key } = await params;
  return handle(async () => archiveFlag(getDb(), actorFrom(req), key, await readJson(req)));
}
