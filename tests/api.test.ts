import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import type { Flag } from "@/lib/types";

process.env.DATABASE_PATH = ":memory:";

// Imported after DATABASE_PATH is set so the route handlers use an isolated in-memory DB.
const flagsRoute = await import("@/app/api/flags/route");
const flagRoute = await import("@/app/api/flags/[key]/route");
const envRoute = await import("@/app/api/flags/[key]/environments/[environment]/route");
const auditRoute = await import("@/app/api/audit/route");

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

  it("records the simulated actor from the x-demo-actor header", async () => {
    const res = await envRoute.PUT(
      req(
        "PUT",
        "/api/flags/instant_transfers_v2/environments/production",
        { enabled: true, expectedVersion: flag.version, confirmProduction: flag.key },
        { "x-demo-actor": "carmen.diaz@finops.example" },
      ),
      ctx({ key: flag.key, environment: "production" }),
    );
    expect(res.status).toBe(200);
    const audit = await (await auditRoute.GET(req("GET", "/api/audit?flag=instant_transfers_v2"))).json();
    expect(audit[0]).toMatchObject({ actor: "carmen.diaz@finops.example", environment: "production" });
  });

  it("falls back to the cookie actor and rejects unknown actors", async () => {
    const r = req("PATCH", "/api/flags/new_kyc_flow", { name: "New KYC flow v2", expectedVersion: 1 }, { cookie: "finops_demo_actor=mallory@evil.example" });
    const res = await flagRoute.PATCH(r, ctx({ key: "new_kyc_flow" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 on a stale version", async () => {
    const res = await envRoute.PUT(
      req("PUT", "/api/flags/instant_transfers_v2/environments/staging", { enabled: false, expectedVersion: flag.version }),
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
