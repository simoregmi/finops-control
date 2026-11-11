import { databasePath, openDb } from "@/server/db";
import { seed, SEED_FLAGS } from "@/server/seed";

// Resets in place (drop + recreate) so a running dev server keeps a valid connection.
const file = databasePath();
let db = openDb(file);
db.exec(`
  DROP TABLE IF EXISTS audit_events;
  DROP TABLE IF EXISTS flag_environments;
  DROP TABLE IF EXISTS flags;
`);
db.close();
db = openDb(file);
seed(db);
db.close();
console.log(`Reset ${file}: ${SEED_FLAGS.length} seeded flags, empty audit log.`);
