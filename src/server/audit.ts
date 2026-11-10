import type { AuditEvent, Environment } from "@/lib/types";
import type { DB } from "./db";
import { auditFiltersSchema, parse } from "./validation";

export interface AuditInput {
  actor: string;
  action: string;
  resourceType: string;
  resourceKey: string;
  environment?: Environment | null;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * The single place audit events are written. Callers must invoke this inside the same
 * transaction as the state change so both commit or neither does.
 */
export function recordAudit(db: DB, e: AuditInput): void {
  db.prepare(
    `INSERT INTO audit_events (actor, action, resource_type, resource_key, environment, old_value, new_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    e.actor,
    e.action,
    e.resourceType,
    e.resourceKey,
    e.environment ?? null,
    e.oldValue === undefined ? null : JSON.stringify(e.oldValue),
    e.newValue === undefined ? null : JSON.stringify(e.newValue),
    new Date().toISOString(),
  );
}

type AuditRow = {
  id: number;
  actor: string;
  action: string;
  resource_type: string;
  resource_key: string;
  environment: Environment | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

export function listAuditEvents(db: DB, filters: unknown = {}): AuditEvent[] {
  const f = parse(auditFiltersSchema, filters);
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.flag) {
    where.push("resource_key = ?");
    params.push(f.flag);
  }
  if (f.actor) {
    where.push("actor = ?");
    params.push(f.actor);
  }
  const rows = db
    .prepare(
      `SELECT * FROM audit_events ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY id DESC LIMIT ?`,
    )
    .all(...params, f.limit) as AuditRow[];
  return rows.map((r) => ({
    id: r.id,
    actor: r.actor,
    action: r.action,
    resourceType: r.resource_type,
    resourceKey: r.resource_key,
    environment: r.environment,
    oldValue: r.old_value === null ? null : JSON.parse(r.old_value),
    newValue: r.new_value === null ? null : JSON.parse(r.new_value),
    createdAt: r.created_at,
  }));
}

export function listAuditActors(db: DB): string[] {
  return (db.prepare("SELECT DISTINCT actor FROM audit_events ORDER BY actor").all() as { actor: string }[]).map(
    (r) => r.actor,
  );
}
