import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { seed } from "./seed";

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS flags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner       TEXT NOT NULL,
  tags        TEXT NOT NULL DEFAULT '[]',
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flag_environments (
  flag_id     INTEGER NOT NULL REFERENCES flags(id),
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  enabled     INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  PRIMARY KEY (flag_id, environment)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor         TEXT NOT NULL,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_key  TEXT NOT NULL,
  environment   TEXT,
  old_value     TEXT,
  new_value     TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_events(resource_type, resource_key);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor);

-- Defense in depth: the service layer never does these, and the database refuses them too.
CREATE TRIGGER IF NOT EXISTS audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS flags_key_immutable BEFORE UPDATE OF key ON flags
WHEN NEW.key <> OLD.key
BEGIN SELECT RAISE(ABORT, 'flag key is immutable'); END;
CREATE TRIGGER IF NOT EXISTS flags_no_delete BEFORE DELETE ON flags
BEGIN SELECT RAISE(ABORT, 'flags are archived, never deleted'); END;
`;

export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export function databasePath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "finops.db");
}

export function isEmpty(db: DB): boolean {
  const row = db.prepare("SELECT COUNT(*) AS c FROM flags").get() as { c: number };
  return row.c === 0;
}

const globalForDb = globalThis as unknown as { __finopsDb?: DB };

/** Process-wide connection. Seeds demo data on first run so `npm run dev` works out of the box. */
export function getDb(): DB {
  if (!globalForDb.__finopsDb) {
    const db = openDb(databasePath());
    if (isEmpty(db)) seed(db);
    globalForDb.__finopsDb = db;
  }
  return globalForDb.__finopsDb;
}
