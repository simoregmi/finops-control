import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/server/db";
import {
  approveProductionChange,
  countPendingRequests,
  getProductionChangeRequest,
  listProductionChangeRequests,
  rejectProductionChange,
  requestProductionChange,
} from "@/server/approvals";
import { listAuditEvents } from "@/server/audit";
import { ServiceError } from "@/server/errors";
import { getFlag, setFlagEnvironment, updateFlag } from "@/server/flags";
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

const KEY = "instant_transfers_v2"; // seeded: production disabled

let db: DB;
beforeEach(() => {
  db = freshDb();
});

function request(actor = ALICE, enabled = true) {
  const f = getFlag(db, KEY);
  return requestProductionChange(db, actor, KEY, { enabled, expectedVersion: f.version, confirmProduction: KEY });
}

describe("requesting a production change", () => {
  it("creates a pending request without modifying the live flag", () => {
    const before = getFlag(db, KEY);
    const req = request();
    expect(req).toMatchObject({
      flagKey: KEY,
      requestedEnabled: true,
      previousEnabled: false,
      baseVersion: before.version,
      status: "pending",
      requestedBy: ALICE,
      reviewedBy: null,
      stale: false,
    });
    expect(Date.parse(req.requestedAt)).not.toBeNaN();
    expect(getFlag(db, KEY)).toEqual(before);
    expect(countPendingRequests(db)).toBe(1);
    expect(listAuditEvents(db)[0]).toMatchObject({
      actor: ALICE,
      action: "production_change.requested",
      resourceKey: KEY,
      environment: "production",
      oldValue: { enabled: false },
      newValue: { requestId: req.id, requestedBy: ALICE, enabled: true, status: "pending" },
    });
  });

  it("keeps the typed production confirmation: missing or wrong confirmation creates nothing", () => {
    const f = getFlag(db, KEY);
    expectServiceError(() => requestProductionChange(db, ALICE, KEY, { enabled: true, expectedVersion: f.version }), "CONFIRMATION_REQUIRED");
    const err = expectServiceError(
      () => requestProductionChange(db, ALICE, KEY, { enabled: true, expectedVersion: f.version, confirmProduction: "yes" }),
      "CONFIRMATION_REQUIRED",
    );
    expect(err.status).toBe(428);
    expect(countPendingRequests(db)).toBe(0);
    expect(auditCount(db)).toBe(0);
  });

  it("validates version, no-op changes, archived flags and duplicates", () => {
    const f = getFlag(db, KEY);
    expectServiceError(
      () => requestProductionChange(db, ALICE, KEY, { enabled: true, expectedVersion: f.version + 1, confirmProduction: KEY }),
      "VERSION_CONFLICT",
    );
    expectServiceError(() => request(ALICE, false), "INVALID_STATE"); // already disabled
    request();
    const dup = expectServiceError(() => request(BOB), "PENDING_REQUEST_EXISTS");
    expect(dup.status).toBe(409);
    expect(countPendingRequests(db)).toBe(1);
  });
});

describe("approving", () => {
  it("applies the change, resolves the request and audits both, when approved by a different actor", () => {
    const req = request(ALICE);
    const { request: approved, flag } = approveProductionChange(db, BOB, req.id);
    expect(flag.environments.production).toBe(true);
    expect(flag.version).toBe(req.baseVersion + 1);
    expect(approved).toMatchObject({ status: "approved", requestedBy: ALICE, reviewedBy: BOB });
    expect(Date.parse(approved.reviewedAt!)).not.toBeNaN();
    expect(countPendingRequests(db)).toBe(0);

    const [applied, decision] = listAuditEvents(db, { flag: KEY });
    expect(decision).toMatchObject({ actor: BOB, action: "production_change.approved", newValue: { requestId: req.id, requestedBy: ALICE, approvedBy: BOB } });
    expect(applied).toMatchObject({
      actor: BOB,
      action: "flag.environment.enabled",
      environment: "production",
      oldValue: { enabled: false },
      newValue: { enabled: true, requestId: req.id, requestedBy: ALICE, approvedBy: BOB },
    });
  });

  it("forbids self-approval and leaves everything unchanged", () => {
    const req = request(ALICE);
    const before = getFlag(db, KEY);
    const audits = auditCount(db);
    const err = expectServiceError(() => approveProductionChange(db, ALICE, req.id), "SELF_APPROVAL_FORBIDDEN");
    expect(err.status).toBe(403);
    expect(getFlag(db, KEY)).toEqual(before);
    expect(getProductionChangeRequest(db, req.id).status).toBe("pending");
    expect(auditCount(db)).toBe(audits);
  });

  it("the database also refuses an approval recorded by the requester", () => {
    const req = request(ALICE);
    expect(() =>
      db.prepare("UPDATE production_change_requests SET status = 'approved', reviewed_by = requested_by WHERE id = ?").run(req.id),
    ).toThrow(/CHECK constraint/);
  });

  it("rejects a stale request with a conflict instead of overwriting a newer value", () => {
    const req = request(ALICE);
    const f = getFlag(db, KEY);
    updateFlag(db, BOB, KEY, { description: "Changed after the request", expectedVersion: f.version });
    expect(listProductionChangeRequests(db, { status: "pending" })[0]).toMatchObject({ id: req.id, stale: true });

    const audits = auditCount(db);
    const err = expectServiceError(() => approveProductionChange(db, BOB, req.id), "STALE_REQUEST");
    expect(err.status).toBe(409);
    expect(getFlag(db, KEY).environments.production).toBe(false);
    expect(getProductionChangeRequest(db, req.id).status).toBe("pending");
    expect(auditCount(db)).toBe(audits);

    rejectProductionChange(db, BOB, req.id); // the way out for a stale request
    expect(request(ALICE).status).toBe("pending");
  });

  it("a concurrent staging change also makes the request stale", () => {
    const req = request(ALICE);
    const f = getFlag(db, KEY);
    setFlagEnvironment(db, BOB, KEY, "staging", { enabled: false, expectedVersion: f.version });
    expectServiceError(() => approveProductionChange(db, BOB, req.id), "STALE_REQUEST");
  });
});

describe("rejecting", () => {
  it("leaves the production flag unchanged and audits the rejection", () => {
    const req = request(ALICE);
    const before = getFlag(db, KEY);
    const rejected = rejectProductionChange(db, BOB, req.id);
    expect(rejected).toMatchObject({ status: "rejected", reviewedBy: BOB });
    expect(getFlag(db, KEY)).toEqual(before);
    expect(listAuditEvents(db)[0]).toMatchObject({
      actor: BOB,
      action: "production_change.rejected",
      oldValue: { status: "pending" },
      newValue: { requestId: req.id, requestedBy: ALICE, rejectedBy: BOB, status: "rejected" },
    });
  });

  it("lets the requester withdraw (reject) their own request", () => {
    const req = request(ALICE);
    expect(rejectProductionChange(db, ALICE, req.id).status).toBe("rejected");
  });
});

describe("duplicate decisions", () => {
  it("prevents approving or rejecting an already resolved request", () => {
    const req = request(ALICE);
    approveProductionChange(db, BOB, req.id);
    const audits = auditCount(db);
    expect(expectServiceError(() => approveProductionChange(db, BOB, req.id), "ALREADY_RESOLVED").status).toBe(409);
    expectServiceError(() => rejectProductionChange(db, BOB, req.id), "ALREADY_RESOLVED");
    expect(auditCount(db)).toBe(audits);
    expect(getFlag(db, KEY).environments.production).toBe(true);

    const other = requestProductionChange(db, ALICE, "new_kyc_flow", {
      enabled: true,
      expectedVersion: getFlag(db, "new_kyc_flow").version,
      confirmProduction: "new_kyc_flow",
    });
    rejectProductionChange(db, BOB, other.id);
    expectServiceError(() => approveProductionChange(db, BOB, other.id), "ALREADY_RESOLVED");
    expect(getFlag(db, "new_kyc_flow").environments.production).toBe(false);
  });

  it("resolved requests are immutable and never deleted at the database level", () => {
    const req = request(ALICE);
    rejectProductionChange(db, BOB, req.id);
    expect(() => db.prepare("UPDATE production_change_requests SET status = 'pending' WHERE id = ?").run(req.id)).toThrow(/immutable/);
    expect(() => db.prepare("DELETE FROM production_change_requests WHERE id = ?").run(req.id)).toThrow(/never deleted/);
  });

  it("returns NOT_FOUND / VALIDATION_FAILED for unknown or invalid ids", () => {
    expectServiceError(() => approveProductionChange(db, BOB, 999), "NOT_FOUND");
    expectServiceError(() => rejectProductionChange(db, BOB, "abc"), "VALIDATION_FAILED");
  });
});
