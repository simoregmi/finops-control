import { openDb, type DB } from "@/server/db";
import { seed } from "@/server/seed";

export const ALICE = "alice.chen@finops.example";
export const BOB = "bob.okafor@finops.example";

export function freshDb(): DB {
  const db = openDb(":memory:");
  seed(db);
  return db;
}

export function auditCount(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM audit_events").get() as { c: number }).c;
}
