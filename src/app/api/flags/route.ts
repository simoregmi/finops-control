import type { NextRequest } from "next/server";
import { getDb } from "@/server/db";
import { createFlag, listFlags } from "@/server/flags";
import { actorFrom, handle, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return handle(() =>
    listFlags(getDb(), {
      q: sp.get("q") || undefined,
      environment: sp.get("environment") || undefined,
      status: sp.get("status") || undefined,
      includeArchived: sp.get("includeArchived") === "true",
    }),
  );
}

export async function POST(req: NextRequest) {
  return handle(async () => createFlag(getDb(), actorFrom(req), await readJson(req)), 201);
}
