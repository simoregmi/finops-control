import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/server/db";
import { listAuditEvents } from "@/server/audit";
import { ServiceError } from "@/server/errors";
import { archiveFlag, createFlag, getFlag, listFlags, setFlagEnvironment, updateFlag } from "@/server/flags";
import { ALICE, BOB, auditCount, freshDb } from "./helpers";

function expectServiceError(fn: () => unknown, code: string): ServiceError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ServiceError);
    expect((e as ServiceError).code).toBe(code);
    return e as ServiceError;
  }
  throw new Error(`expected ServiceError ${code}`);
}

let db: DB;
beforeEach(() => {
  db = freshDb();
});

describe("seed data", () => {
  it("contains the required fictional flags", () => {
    const keys = listFlags(db).map((f) => f.key);
    expect(keys.length).toBeGreaterThanOrEqual(10);
    expect(keys.length).toBeLessThanOrEqual(15);
    expect(keys).toEqual(expect.arrayContaining(["instant_transfers_v2", "new_kyc_flow", "refund_risk_check"]));
  });
});

describe("listFlags filters", () => {
  it("searches key, name, owner and tags case-insensitively", () => {
    expect(listFlags(db, { q: "KYC" }).map((f) => f.key)).toEqual(
      expect.arrayContaining(["new_kyc_flow", "sanctions_screening_batch"]),
    );
    expect(listFlags(db, { q: "payments-platform" }).every((f) => f.owner === "payments-platform")).toBe(true);
  });

  it("filters by status within an environment", () => {
    const prodOn = listFlags(db, { environment: "production", status: "enabled" });
    expect(prodOn.length).toBeGreaterThan(0);
    expect(prodOn.every((f) => f.environments.production)).toBe(true);
    const prodOff = listFlags(db, { environment: "production", status: "disabled" });
    expect(prodOff.every((f) => !f.environments.production)).toBe(true);
    expect(prodOn.length + prodOff.length).toBe(listFlags(db).length);
  });

  it("without environment, disabled means disabled everywhere", () => {
    const off = listFlags(db, { status: "disabled" });
    expect(off.map((f) => f.key).sort()).toEqual(["legacy_ledger_sync", "merchant_onboarding_wizard"]);
  });

  it("rejects invalid filter values", () => {
    expectServiceError(() => listFlags(db, { environment: "prod" }), "VALIDATION_FAILED");
    expectServiceError(() => listFlags(db, { status: "maybe" }), "VALIDATION_FAILED");
  });
});

describe("environment toggles", () => {
  it("toggles a non-production environment, bumps version and writes an audit event", () => {
    const before = getFlag(db, "ach_same_day");
    const after = setFlagEnvironment(db, ALICE, "ach_same_day", "staging", { enabled: true, expectedVersion: before.version });
    expect(after.environments.staging).toBe(true);
    expect(after.version).toBe(before.version + 1);
    expect(getFlag(db, "ach_same_day").environments.staging).toBe(true);

    const [event] = listAuditEvents(db, { flag: "ach_same_day" });
    expect(event).toMatchObject({
      actor: ALICE,
      action: "flag.environment.enabled",
      resourceType: "feature_flag",
      resourceKey: "ach_same_day",
      environment: "staging",
      oldValue: { enabled: false },
      newValue: { enabled: true },
    });
    expect(Date.parse(event.createdAt)).not.toBeNaN();
  });

  it("environments are independent", () => {
    const f = getFlag(db, "instant_transfers_v2");
    const after = setFlagEnvironment(db, ALICE, f.key, "development", { enabled: false, expectedVersion: f.version });
    expect(after.environments).toEqual({ development: false, staging: true, production: false });
  });

  it("rejects production changes without confirmation, with no state change and no audit", () => {
    const f = getFlag(db, "instant_transfers_v2");
    expectServiceError(() => setFlagEnvironment(db, ALICE, f.key, "production", { enabled: true, expectedVersion: f.version }), "CONFIRMATION_REQUIRED");
    expectServiceError(
      () => setFlagEnvironment(db, ALICE, f.key, "production", { enabled: true, expectedVersion: f.version, confirmProduction: "yes" }),
      "CONFIRMATION_REQUIRED",
    );
    expect(getFlag(db, f.key)).toEqual(f);
    expect(auditCount(db)).toBe(0);
  });

  it("never applies a confirmed production change directly: it must go through approval", () => {
    const f = getFlag(db, "instant_transfers_v2");
    const err = expectServiceError(
      () => setFlagEnvironment(db, BOB, f.key, "production", { enabled: true, expectedVersion: f.version, confirmProduction: f.key }),
      "INVALID_STATE",
    );
    expect(err.message).toMatch(/approval/);
    expect(getFlag(db, f.key)).toEqual(f);
    expect(auditCount(db)).toBe(0);
  });

  it("rejects invalid environment and non-boolean enabled", () => {
    expectServiceError(() => setFlagEnvironment(db, ALICE, "ach_same_day", "qa", { enabled: true, expectedVersion: 1 }), "VALIDATION_FAILED");
    expectServiceError(() => setFlagEnvironment(db, ALICE, "ach_same_day", "staging", { enabled: "true", expectedVersion: 1 }), "VALIDATION_FAILED");
    expectServiceError(() => setFlagEnvironment(db, ALICE, "ach_same_day", "staging", { enabled: true }), "VALIDATION_FAILED");
  });

  it("does not audit a no-op toggle", () => {
    const f = getFlag(db, "refund_risk_check");
    setFlagEnvironment(db, ALICE, f.key, "development", { enabled: true, expectedVersion: f.version });
    expect(getFlag(db, f.key).version).toBe(f.version);
    expect(auditCount(db)).toBe(0);
  });

  it("returns NOT_FOUND for unknown flags", () => {
    expectServiceError(() => setFlagEnvironment(db, ALICE, "nope_flag", "staging", { enabled: true, expectedVersion: 1 }), "NOT_FOUND");
  });
});

describe("optimistic concurrency", () => {
  it("rejects a stale expectedVersion with VERSION_CONFLICT and leaves state untouched", () => {
    const f = getFlag(db, "dispute_auto_triage");
    updateFlag(db, ALICE, f.key, { name: "Dispute auto triage", expectedVersion: f.version });
    const err = expectServiceError(
      () => setFlagEnvironment(db, BOB, f.key, "staging", { enabled: !f.environments.staging, expectedVersion: f.version }),
      "VERSION_CONFLICT",
    );
    expect(err.status).toBe(409);
    expect(getFlag(db, f.key).environments.staging).toBe(f.environments.staging);
    expect(auditCount(db)).toBe(1);
  });
});

describe("metadata updates and validation", () => {
  it("updates metadata and records old/new values for changed fields only", () => {
    const f = getFlag(db, "new_kyc_flow");
    const after = updateFlag(db, ALICE, f.key, { owner: "kyc-platform", name: f.name, expectedVersion: f.version });
    expect(after.owner).toBe("kyc-platform");
    expect(listAuditEvents(db)[0]).toMatchObject({
      action: "flag.updated",
      oldValue: { owner: "compliance-eng" },
      newValue: { owner: "kyc-platform" },
    });
  });

  it("treats the key as immutable (service and database)", () => {
    const f = getFlag(db, "new_kyc_flow");
    const err = expectServiceError(() => updateFlag(db, ALICE, f.key, { key: "renamed_flow", expectedVersion: f.version }), "VALIDATION_FAILED");
    expect(err.details?.[0].path).toBe("key");
    expect(() => db.prepare("UPDATE flags SET key = 'renamed_flow' WHERE key = 'new_kyc_flow'").run()).toThrow(/immutable/);
  });

  it.each([
    [{ name: "ab" }, "name"],
    [{ name: "x".repeat(81) }, "name"],
    [{ owner: "Payments Platform" }, "owner"],
    [{ description: "x".repeat(501) }, "description"],
    [{ tags: ["ok", "ok"] }, "tags"],
    [{ tags: ["Bad Tag"] }, "tags.0"],
    [{ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, "tags"],
    [{ unexpected: true }, "(root)"],
  ])("rejects invalid update %j", (patch, path) => {
    const f = getFlag(db, "new_kyc_flow");
    const err = expectServiceError(() => updateFlag(db, ALICE, f.key, { ...patch, expectedVersion: f.version }), "VALIDATION_FAILED");
    expect(err.details?.map((d) => d.path)).toContain(path);
    expect(auditCount(db)).toBe(0);
  });
});

describe("create", () => {
  it("creates a flag disabled everywhere and audits it", () => {
    const flag = createFlag(db, BOB, { key: "refund_auto_approve", name: "Refund auto-approve", owner: "risk-eng", tags: ["refunds"] });
    expect(flag.environments).toEqual({ development: false, staging: false, production: false });
    expect(flag.version).toBe(1);
    expect(listAuditEvents(db)[0]).toMatchObject({ actor: BOB, action: "flag.created", oldValue: null, resourceKey: "refund_auto_approve" });
  });

  it.each(["Refund_Flag", "1st_flag", "ab", "has-hyphen", "x".repeat(65), ""])("rejects invalid key %j", (key) => {
    expectServiceError(() => createFlag(db, BOB, { key, name: "Valid name", owner: "risk-eng" }), "VALIDATION_FAILED");
  });

  it("rejects duplicate keys", () => {
    expectServiceError(() => createFlag(db, BOB, { key: "new_kyc_flow", name: "Dup", owner: "risk-eng" }), "DUPLICATE_KEY");
  });
});

describe("archive", () => {
  it("refuses to archive a flag that is enabled anywhere", () => {
    const f = getFlag(db, "refund_risk_check");
    expectServiceError(() => archiveFlag(db, ALICE, f.key, { expectedVersion: f.version }), "INVALID_STATE");
  });

  it("archives (never deletes) a disabled flag; archived flags are read-only and hidden by default", () => {
    const f = getFlag(db, "legacy_ledger_sync");
    const archived = archiveFlag(db, ALICE, f.key, { expectedVersion: f.version });
    expect(archived.archived).toBe(true);
    expect(listFlags(db).map((x) => x.key)).not.toContain(f.key);
    expect(listFlags(db, { includeArchived: true }).map((x) => x.key)).toContain(f.key);
    expectServiceError(() => setFlagEnvironment(db, ALICE, f.key, "development", { enabled: true, expectedVersion: archived.version }), "INVALID_STATE");
    expectServiceError(() => updateFlag(db, ALICE, f.key, { name: "New name", expectedVersion: archived.version }), "INVALID_STATE");
    expectServiceError(() => createFlag(db, ALICE, { key: f.key, name: "Reuse", owner: "core-banking" }), "DUPLICATE_KEY");
    expect(() => db.prepare("DELETE FROM flags WHERE key = ?").run(f.key)).toThrow(/never deleted/);
    expect(listAuditEvents(db)[0]).toMatchObject({ action: "flag.archived", oldValue: { archived: false }, newValue: { archived: true } });
  });
});

describe("audit integrity", () => {
  it("rolls back the state change if the audit write fails (atomicity)", () => {
    db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END;");
    const f = getFlag(db, "ach_same_day");
    expect(() => setFlagEnvironment(db, ALICE, f.key, "staging", { enabled: true, expectedVersion: f.version })).toThrow(/simulated audit failure/);
    expect(getFlag(db, f.key)).toEqual(f);
    expect(() => updateFlag(db, ALICE, f.key, { name: "Changed name", expectedVersion: f.version })).toThrow(/simulated audit failure/);
    expect(getFlag(db, f.key)).toEqual(f);
  });

  it("audit log is append-only at the database level", () => {
    const f = getFlag(db, "ach_same_day");
    setFlagEnvironment(db, ALICE, f.key, "staging", { enabled: true, expectedVersion: f.version });
    expect(() => db.prepare("UPDATE audit_events SET actor = 'mallory'").run()).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM audit_events").run()).toThrow(/append-only/);
    expect(auditCount(db)).toBe(1);
  });

  it("filters audit events by flag and actor", () => {
    const a = getFlag(db, "ach_same_day");
    const b = getFlag(db, "statement_pdf_v3");
    setFlagEnvironment(db, ALICE, a.key, "staging", { enabled: true, expectedVersion: a.version });
    setFlagEnvironment(db, BOB, b.key, "staging", { enabled: true, expectedVersion: b.version });
    expect(listAuditEvents(db, { flag: a.key }).map((e) => e.actor)).toEqual([ALICE]);
    expect(listAuditEvents(db, { actor: BOB }).map((e) => e.resourceKey)).toEqual([b.key]);
  });
});
