import type { ApprovalStatus, Flag, ProductionChangeRequest } from "@/lib/types";
import type { DB } from "./db";
import { recordAudit } from "./audit";
import { ServiceError } from "./errors";
import { assertActive, assertProductionConfirmed, assertVersion, bumpVersion, requireFlag, RESOURCE_TYPE } from "./flags";
import { approvalFiltersSchema, parse, requestIdSchema, setEnvironmentSchema } from "./validation";

// Production changes are never applied directly. They become pending requests that a
// different (simulated) actor must approve. Every step runs in one transaction with its audit events.

type RequestRow = {
  id: number;
  flag_key: string;
  flag_name: string;
  flag_version: number;
  requested_enabled: 0 | 1;
  previous_enabled: 0 | 1;
  base_version: number;
  status: ApprovalStatus;
  requested_by: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

const SELECT_REQUESTS = `
  SELECT r.*, f.name AS flag_name, f.version AS flag_version
  FROM production_change_requests r JOIN flags f ON f.id = r.flag_id`;

function toRequest(r: RequestRow): ProductionChangeRequest {
  return {
    id: r.id,
    flagKey: r.flag_key,
    flagName: r.flag_name,
    requestedEnabled: r.requested_enabled === 1,
    previousEnabled: r.previous_enabled === 1,
    baseVersion: r.base_version,
    currentFlagVersion: r.flag_version,
    stale: r.status === "pending" && r.flag_version !== r.base_version,
    status: r.status,
    requestedBy: r.requested_by,
    requestedAt: r.requested_at,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
  };
}

function loadRequest(db: DB, id: number): ProductionChangeRequest | undefined {
  const row = db.prepare(`${SELECT_REQUESTS} WHERE r.id = ?`).get(id) as RequestRow | undefined;
  return row && toRequest(row);
}

function requirePendingRequest(db: DB, rawId: unknown): ProductionChangeRequest {
  const id = parse(requestIdSchema, rawId);
  const req = loadRequest(db, id);
  if (!req) throw new ServiceError("NOT_FOUND", `Change request #${id} not found`);
  if (req.status !== "pending") {
    throw new ServiceError("ALREADY_RESOLVED", `Change request #${id} was already ${req.status} by ${req.reviewedBy} at ${req.reviewedAt}`);
  }
  return req;
}

function resolve(db: DB, id: number, status: "approved" | "rejected", reviewer: string): void {
  const res = db
    .prepare("UPDATE production_change_requests SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'")
    .run(status, reviewer, new Date().toISOString(), id);
  if (res.changes !== 1) throw new ServiceError("ALREADY_RESOLVED", `Change request #${id} was resolved concurrently`);
}

const describeChange = (r: ProductionChangeRequest) => ({
  requestId: r.id,
  requestedBy: r.requestedBy,
  enabled: r.requestedEnabled,
});

// ---------- Queries ----------

export function getProductionChangeRequest(db: DB, rawId: unknown): ProductionChangeRequest {
  const id = parse(requestIdSchema, rawId);
  const req = loadRequest(db, id);
  if (!req) throw new ServiceError("NOT_FOUND", `Change request #${id} not found`);
  return req;
}

export function listProductionChangeRequests(db: DB, filters: unknown = {}): ProductionChangeRequest[] {
  const f = parse(approvalFiltersSchema, filters);
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.status !== "all") {
    where.push("r.status = ?");
    params.push(f.status);
  }
  if (f.flag) {
    where.push("r.flag_key = ?");
    params.push(f.flag);
  }
  const order = f.status === "pending" ? "r.id ASC" : "COALESCE(r.reviewed_at, r.requested_at) DESC, r.id DESC";
  const rows = db
    .prepare(`${SELECT_REQUESTS} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ?`)
    .all(...params, f.limit) as RequestRow[];
  return rows.map(toRequest);
}

export function countPendingRequests(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM production_change_requests WHERE status = 'pending'").get() as { c: number }).c;
}

// ---------- Mutations ----------

/** Creates a pending request. The live production value is not touched. */
export function requestProductionChange(db: DB, actor: string, key: string, input: unknown): ProductionChangeRequest {
  const data = parse(setEnvironmentSchema, input);
  assertProductionConfirmed(key, data.confirmProduction);
  return db.transaction(() => {
    const { row, flag } = requireFlag(db, key);
    assertVersion(flag, data.expectedVersion);
    assertActive(flag);
    if (flag.environments.production === data.enabled) {
      throw new ServiceError("INVALID_STATE", `Flag '${key}' is already ${data.enabled ? "enabled" : "disabled"} in production`);
    }
    const pending = db
      .prepare("SELECT id, requested_by FROM production_change_requests WHERE flag_id = ? AND status = 'pending'")
      .get(row.id) as { id: number; requested_by: string } | undefined;
    if (pending) {
      throw new ServiceError(
        "PENDING_REQUEST_EXISTS",
        `Flag '${key}' already has a pending production change request (#${pending.id} by ${pending.requested_by}). It must be approved or rejected first.`,
      );
    }
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO production_change_requests
           (flag_id, flag_key, requested_enabled, previous_enabled, base_version, requested_by, requested_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, key, data.enabled ? 1 : 0, flag.environments.production ? 1 : 0, flag.version, actor, new Date().toISOString());
    const request = loadRequest(db, Number(lastInsertRowid))!;
    recordAudit(db, {
      actor,
      action: "production_change.requested",
      resourceType: RESOURCE_TYPE,
      resourceKey: key,
      environment: "production",
      oldValue: { enabled: request.previousEnabled },
      newValue: { ...describeChange(request), status: "pending", baseVersion: request.baseVersion },
    });
    return request;
  }).immediate();
}

/**
 * Applies the requested production change. Rejects self-approval, already-resolved requests,
 * and stale requests (flag changed since submission) without writing anything.
 */
export function approveProductionChange(db: DB, reviewer: string, rawId: unknown): { request: ProductionChangeRequest; flag: Flag } {
  return db.transaction(() => {
    const req = requirePendingRequest(db, rawId);
    if (req.requestedBy === reviewer) {
      throw new ServiceError(
        "SELF_APPROVAL_FORBIDDEN",
        `Separation of duties: ${reviewer} requested change #${req.id} and cannot approve it. A different person must approve.`,
      );
    }
    const { row, flag } = requireFlag(db, req.flagKey);
    if (flag.version !== req.baseVersion) {
      throw new ServiceError(
        "STALE_REQUEST",
        `Flag '${req.flagKey}' changed after request #${req.id} was submitted (request based on v${req.baseVersion}, current is v${flag.version}). Reject this request and submit a new one.`,
      );
    }
    assertActive(flag);

    db.prepare("UPDATE flag_environments SET enabled = ? WHERE flag_id = ? AND environment = 'production'").run(
      req.requestedEnabled ? 1 : 0,
      row.id,
    );
    bumpVersion(db, row);
    resolve(db, req.id, "approved", reviewer);
    recordAudit(db, {
      actor: reviewer,
      action: "production_change.approved",
      resourceType: RESOURCE_TYPE,
      resourceKey: req.flagKey,
      environment: "production",
      oldValue: { status: "pending" },
      newValue: { ...describeChange(req), status: "approved", approvedBy: reviewer },
    });
    recordAudit(db, {
      actor: reviewer,
      action: req.requestedEnabled ? "flag.environment.enabled" : "flag.environment.disabled",
      resourceType: RESOURCE_TYPE,
      resourceKey: req.flagKey,
      environment: "production",
      oldValue: { enabled: req.previousEnabled },
      newValue: { ...describeChange(req), approvedBy: reviewer },
    });
    return { request: loadRequest(db, req.id)!, flag: requireFlag(db, req.flagKey).flag };
  }).immediate();
}

/** Rejects a pending request. The flag is not changed. The requester may reject (withdraw) their own request. */
export function rejectProductionChange(db: DB, reviewer: string, rawId: unknown): ProductionChangeRequest {
  return db.transaction(() => {
    const req = requirePendingRequest(db, rawId);
    resolve(db, req.id, "rejected", reviewer);
    recordAudit(db, {
      actor: reviewer,
      action: "production_change.rejected",
      resourceType: RESOURCE_TYPE,
      resourceKey: req.flagKey,
      environment: "production",
      oldValue: { status: "pending" },
      newValue: { ...describeChange(req), status: "rejected", rejectedBy: reviewer },
    });
    return loadRequest(db, req.id)!;
  }).immediate();
}
