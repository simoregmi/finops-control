import { ENVIRONMENTS, type Environment, type Flag } from "@/lib/types";
import type { DB } from "./db";
import { recordAudit } from "./audit";
import { ServiceError } from "./errors";
import {
  archiveFlagSchema,
  createFlagSchema,
  environmentSchema,
  flagFiltersSchema,
  parse,
  setEnvironmentSchema,
  updateFlagSchema,
} from "./validation";

const RESOURCE_TYPE = "feature_flag";

type FlagRow = {
  id: number;
  key: string;
  name: string;
  description: string;
  owner: string;
  tags: string;
  archived: 0 | 1;
  version: number;
  created_at: string;
  updated_at: string;
};

function environmentsFor(db: DB, flagIds: number[]): Map<number, Record<Environment, boolean>> {
  const result = new Map<number, Record<Environment, boolean>>();
  if (flagIds.length === 0) return result;
  const rows = db
    .prepare(
      `SELECT flag_id, environment, enabled FROM flag_environments
       WHERE flag_id IN (${flagIds.map(() => "?").join(",")})`,
    )
    .all(...flagIds) as { flag_id: number; environment: Environment; enabled: 0 | 1 }[];
  for (const id of flagIds) result.set(id, { development: false, staging: false, production: false });
  for (const r of rows) result.get(r.flag_id)![r.environment] = r.enabled === 1;
  return result;
}

function toFlag(row: FlagRow, environments: Record<Environment, boolean>): Flag {
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    owner: row.owner,
    tags: JSON.parse(row.tags) as string[],
    archived: row.archived === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    environments,
  };
}

function loadRow(db: DB, key: string): FlagRow | undefined {
  return db.prepare("SELECT * FROM flags WHERE key = ?").get(key) as FlagRow | undefined;
}

function requireFlag(db: DB, key: string): { row: FlagRow; flag: Flag } {
  const row = loadRow(db, key);
  if (!row) throw new ServiceError("NOT_FOUND", `Flag '${key}' not found`);
  return { row, flag: toFlag(row, environmentsFor(db, [row.id]).get(row.id)!) };
}

function assertVersion(flag: Flag, expectedVersion: number): void {
  if (flag.version !== expectedVersion) {
    throw new ServiceError(
      "VERSION_CONFLICT",
      `Flag '${flag.key}' was changed by someone else (you have version ${expectedVersion}, current is ${flag.version}). Reload and try again.`,
    );
  }
}

function assertActive(flag: Flag): void {
  if (flag.archived) throw new ServiceError("INVALID_STATE", `Flag '${flag.key}' is archived and read-only`);
}

function bumpVersion(db: DB, row: FlagRow): void {
  const res = db
    .prepare("UPDATE flags SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
    .run(new Date().toISOString(), row.id, row.version);
  if (res.changes !== 1) throw new ServiceError("VERSION_CONFLICT", `Flag '${row.key}' was changed concurrently`);
}

// ---------- Queries ----------

export function getFlag(db: DB, key: string): Flag {
  return requireFlag(db, key).flag;
}

export function listFlags(db: DB, filters: unknown = {}): Flag[] {
  const f = parse(flagFiltersSchema, filters);
  const where: string[] = [];
  const params: unknown[] = [];

  if (!f.includeArchived) where.push("f.archived = 0");
  if (f.q) {
    where.push(
      "(instr(lower(f.key), lower(?)) > 0 OR instr(lower(f.name), lower(?)) > 0 OR instr(lower(f.owner), lower(?)) > 0 OR instr(lower(f.tags), lower(?)) > 0)",
    );
    params.push(f.q, f.q, f.q, f.q);
  }
  // `environment` scopes the status filter. Without an environment, "enabled" means enabled
  // in at least one environment and "disabled" means disabled everywhere.
  if (f.status !== "all") {
    const envClause = f.environment ? "AND fe.environment = ?" : "";
    if (f.environment) params.push(f.environment);
    if (f.status === "enabled") {
      where.push(`EXISTS (SELECT 1 FROM flag_environments fe WHERE fe.flag_id = f.id ${envClause} AND fe.enabled = 1)`);
    } else {
      where.push(`NOT EXISTS (SELECT 1 FROM flag_environments fe WHERE fe.flag_id = f.id ${envClause} AND fe.enabled = 1)`);
    }
  }

  const rows = db
    .prepare(`SELECT f.* FROM flags f ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY f.key`)
    .all(...params) as FlagRow[];
  const envs = environmentsFor(db, rows.map((r) => r.id));
  return rows.map((r) => toFlag(r, envs.get(r.id)!));
}

// ---------- Mutations (each runs in one transaction with its audit event) ----------

export function createFlag(db: DB, actor: string, input: unknown): Flag {
  const data = parse(createFlagSchema, input);
  return db.transaction(() => {
    if (loadRow(db, data.key)) {
      throw new ServiceError("DUPLICATE_KEY", `A flag with key '${data.key}' already exists (keys are never reused, even after archival)`);
    }
    const now = new Date().toISOString();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO flags (key, name, description, owner, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(data.key, data.name, data.description, data.owner, JSON.stringify(data.tags), now, now);
    const insertEnv = db.prepare("INSERT INTO flag_environments (flag_id, environment, enabled) VALUES (?, ?, 0)");
    for (const env of ENVIRONMENTS) insertEnv.run(lastInsertRowid, env);

    const flag = requireFlag(db, data.key).flag;
    recordAudit(db, {
      actor,
      action: "flag.created",
      resourceType: RESOURCE_TYPE,
      resourceKey: flag.key,
      oldValue: null,
      newValue: { name: flag.name, description: flag.description, owner: flag.owner, tags: flag.tags, environments: flag.environments },
    });
    return flag;
  }).immediate();
}

const EDITABLE_FIELDS = ["name", "description", "owner", "tags"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

export function updateFlag(db: DB, actor: string, key: string, input: unknown): Flag {
  if (input && typeof input === "object" && "key" in input) {
    throw new ServiceError("VALIDATION_FAILED", "Flag key is immutable", [
      { path: "key", message: "Flag key cannot be changed. Create a new flag instead." },
    ]);
  }
  const data = parse(updateFlagSchema, input);
  return db.transaction(() => {
    const { row, flag } = requireFlag(db, key);
    assertVersion(flag, data.expectedVersion);
    assertActive(flag);

    const oldValue: Partial<Record<EditableField, unknown>> = {};
    const newValue: Partial<Record<EditableField, unknown>> = {};
    for (const field of EDITABLE_FIELDS) {
      const next = data[field];
      if (next !== undefined && JSON.stringify(next) !== JSON.stringify(flag[field])) {
        oldValue[field] = flag[field];
        newValue[field] = next;
      }
    }
    if (Object.keys(newValue).length === 0) return flag; // no-op: nothing changed, nothing audited

    const merged = { ...flag, ...newValue } as Flag;
    db.prepare("UPDATE flags SET name = ?, description = ?, owner = ?, tags = ? WHERE id = ?").run(
      merged.name,
      merged.description,
      merged.owner,
      JSON.stringify(merged.tags),
      row.id,
    );
    bumpVersion(db, row);
    recordAudit(db, { actor, action: "flag.updated", resourceType: RESOURCE_TYPE, resourceKey: key, oldValue, newValue });
    return requireFlag(db, key).flag;
  }).immediate();
}

export function setFlagEnvironment(db: DB, actor: string, key: string, environment: unknown, input: unknown): Flag {
  const env = parse(environmentSchema, environment);
  const data = parse(setEnvironmentSchema, input);
  if (env === "production" && data.confirmProduction !== key) {
    throw new ServiceError(
      "CONFIRMATION_REQUIRED",
      "Production changes require explicit confirmation: set confirmProduction to the flag key",
      [{ path: "confirmProduction", message: `Type '${key}' to confirm` }],
    );
  }
  return db.transaction(() => {
    const { row, flag } = requireFlag(db, key);
    assertVersion(flag, data.expectedVersion);
    assertActive(flag);
    if (flag.environments[env] === data.enabled) return flag;

    db.prepare("UPDATE flag_environments SET enabled = ? WHERE flag_id = ? AND environment = ?").run(
      data.enabled ? 1 : 0,
      row.id,
      env,
    );
    bumpVersion(db, row);
    recordAudit(db, {
      actor,
      action: data.enabled ? "flag.environment.enabled" : "flag.environment.disabled",
      resourceType: RESOURCE_TYPE,
      resourceKey: key,
      environment: env,
      oldValue: { enabled: flag.environments[env] },
      newValue: { enabled: data.enabled },
    });
    return requireFlag(db, key).flag;
  }).immediate();
}

export function archiveFlag(db: DB, actor: string, key: string, input: unknown): Flag {
  const data = parse(archiveFlagSchema, input);
  return db.transaction(() => {
    const { row, flag } = requireFlag(db, key);
    assertVersion(flag, data.expectedVersion);
    assertActive(flag);
    const enabledIn = ENVIRONMENTS.filter((e) => flag.environments[e]);
    if (enabledIn.length > 0) {
      throw new ServiceError("INVALID_STATE", `Disable the flag in all environments before archiving (enabled in: ${enabledIn.join(", ")})`);
    }
    db.prepare("UPDATE flags SET archived = 1 WHERE id = ?").run(row.id);
    bumpVersion(db, row);
    recordAudit(db, {
      actor,
      action: "flag.archived",
      resourceType: RESOURCE_TYPE,
      resourceKey: key,
      oldValue: { archived: false },
      newValue: { archived: true },
    });
    return requireFlag(db, key).flag;
  }).immediate();
}
