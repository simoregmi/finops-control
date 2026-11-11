import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import type { Flag } from "@/lib/types";

process.env.DATABASE_PATH = ":memory:";

// Imported after DATABASE_PATH is set so the route handlers use an isolated in-memory DB.
const flagsRoute = await import("@/app/api/flags/route");
const flagRoute = await import("@/app/api/flags/[key]/route");
const envRoute = await import("@/app/api/flags/[key]/environments/[environment]/route");
const auditRoute = await import("@/app/api/audit/route");
const approvalsRoute = await import("@/app/api/approvals/route");
const approveRoute = await import("@/app/api/approvals/[id]/approve/route");
const rejectRoute = await import("@/app/api/approvals/[id]/reject/route");

const BOB = "bob.okafor@finops.example";
const CARMEN = "carmen.diaz@finops.example";

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const ctx = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

async function getFlag(key: string): Promise<Flag> {
  return (await flagRoute.GET(req("GET", `/api/flags/${key}`), ctx({ key }))).json();
}

describe("API", () => {
  let flag: Flag;
  beforeAll(async () => {
    flag = await getFlag("instant_transfers_v2");
  });

  it("blocks a direct API call that bypasses the production confirmation dialog", async () => {
    const res = await envRoute.PUT(
      req("PUT", "/api/flags/instant_transfers_v2/environments/production", { enabled: true, expectedVersion: flag.version }),
      ctx({ key: flag.key, environment: "production" }),
    );
    expect(res.status).toBe(428);
    expect((await res.json()).error.code).toBe("CONFIRMATION_REQUIRED");
    expect((await getFlag(flag.key)).environments.production).toBe(false);
  });

  it("turns a confirmed production change into a pending request (202) attributed to the header actor", async () => {
    const res = await envRoute.PUT(
      req(
        "PUT",
        "/api/flags/instant_transfers_v2/environments/production",
        { enabled: true, expectedVersion: flag.version, confirmProduction: flag.key },
        { "x-demo-actor": CARMEN },
      ),
      ctx({ key: flag.key, environment: "production" }),
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ status: "pending", requestedBy: CARMEN, requestedEnabled: true, flagKey: flag.key });
    expect((await getFlag(flag.key)).environments.production).toBe(false);
    const audit = await (await auditRoute.GET(req("GET", "/api/audit?flag=instant_transfers_v2"))).json();
    expect(audit[0]).toMatchObject({ actor: CARMEN, action: "production_change.requested", environment: "production" });
  });

  it("enforces separation of duties on the server: 403 self-approval, 200 by another actor, 409 on a repeat decision", async () => {
    const [pending] = await (await approvalsRoute.GET(req("GET", "/api/approvals?status=pending&flag=instant_transfers_v2"))).json();
    const id = String(pending.id);

    const self = await approveRoute.POST(req("POST", `/api/approvals/${id}/approve`, undefined, { "x-demo-actor": CARMEN }), ctx({ id }));
    expect(self.status).toBe(403);
    expect((await self.json()).error.code).toBe("SELF_APPROVAL_FORBIDDEN");
    expect((await getFlag("instant_transfers_v2")).environments.production).toBe(false);

    const ok = await approveRoute.POST(req("POST", `/api/approvals/${id}/approve`, undefined, { "x-demo-actor": BOB }), ctx({ id }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).request).toMatchObject({ status: "approved", reviewedBy: BOB, requestedBy: CARMEN });
    expect((await getFlag("instant_transfers_v2")).environments.production).toBe(true);

    const again = await rejectRoute.POST(req("POST", `/api/approvals/${id}/reject`, undefined, { "x-demo-actor": BOB }), ctx({ id }));
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("ALREADY_RESOLVED");
  });

  it("returns 404 for unknown requests and 400 for invalid ids", async () => {
    expect((await approveRoute.POST(req("POST", "/api/approvals/9999/approve"), ctx({ id: "9999" }))).status).toBe(404);
    expect((await rejectRoute.POST(req("POST", "/api/approvals/abc/reject"), ctx({ id: "abc" }))).status).toBe(400);
  });

  it("falls back to the cookie actor and rejects unknown actors", async () => {
    const r = req("PATCH", "/api/flags/new_kyc_flow", { name: "New KYC flow v2", expectedVersion: 1 }, { cookie: "finops_demo_actor=mallory@evil.example" });
    const res = await flagRoute.PATCH(r, ctx({ key: "new_kyc_flow" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 on a stale version", async () => {
    const stale = (await getFlag(flag.key)).version + 1;
    const res = await envRoute.PUT(
      req("PUT", "/api/flags/instant_transfers_v2/environments/staging", { enabled: false, expectedVersion: stale }),
      ctx({ key: flag.key, environment: "staging" }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("VERSION_CONFLICT");
  });

  it("returns 400 for malformed JSON and for attempts to change the key", async () => {
    const bad = await flagRoute.PATCH(req("PATCH", "/api/flags/new_kyc_flow", "{not json"), ctx({ key: "new_kyc_flow" }));
    expect(bad.status).toBe(400);
    const rename = await flagRoute.PATCH(req("PATCH", "/api/flags/new_kyc_flow", { key: "x_flow", expectedVersion: 1 }), ctx({ key: "new_kyc_flow" }));
    expect(rename.status).toBe(400);
    expect((await rename.json()).error.details[0].path).toBe("key");
  });

  it("creates a flag (201) and returns field errors for invalid input", async () => {
    const created = await flagsRoute.POST(req("POST", "/api/flags", { key: "kyc_doc_ocr", name: "KYC document OCR", owner: "compliance-eng" }));
    expect(created.status).toBe(201);
    const invalid = await flagsRoute.POST(req("POST", "/api/flags", { key: "Bad Key", name: "x", owner: "" }));
    expect(invalid.status).toBe(400);
    const paths = (await invalid.json()).error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["key", "name", "owner"]));
  });

  it("filters the list via query params", async () => {
    const res = await flagsRoute.GET(req("GET", "/api/flags?environment=production&status=enabled"));
    const flags: Flag[] = await res.json();
    expect(flags.every((f) => f.environments.production)).toBe(true);
    expect((await flagsRoute.GET(req("GET", "/api/flags?status=bogus"))).status).toBe(400);
  });
});
