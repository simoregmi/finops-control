import { NextResponse, type NextRequest } from "next/server";
import { DEMO_ACTOR_COOKIE, DEMO_ACTOR_HEADER } from "@/lib/types";
import { resolveActor } from "./actor";
import { ServiceError } from "./errors";

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ServiceError("VALIDATION_FAILED", "Request body must be valid JSON");
  }
}

export function actorFrom(req: NextRequest): string {
  return resolveActor(req.headers.get(DEMO_ACTOR_HEADER), req.cookies.get(DEMO_ACTOR_COOKIE)?.value);
}

/** Maps service errors to consistent JSON responses: { error: { code, message, details? } }. */
export async function handle(fn: () => unknown | Promise<unknown>, successStatus = 200): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn(), { status: successStatus });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        { status: err.status },
      );
    }
    console.error(err);
    return NextResponse.json({ error: { code: "INTERNAL", message: "Unexpected server error" } }, { status: 500 });
  }
}
