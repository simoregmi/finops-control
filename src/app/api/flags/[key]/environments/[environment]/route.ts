import type { NextRequest } from "next/server";
import { getDb } from "@/server/db";
import { setFlagEnvironment } from "@/server/flags";
import { actorFrom, handle, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string; environment: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { key, environment } = await params;
  return handle(async () => setFlagEnvironment(getDb(), actorFrom(req), key, environment, await readJson(req)));
}
