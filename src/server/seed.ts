import type { DB } from "./db";
import type { Environment } from "@/lib/types";

type SeedFlag = {
  key: string;
  name: string;
  description: string;
  owner: string;
  tags: string[];
  on: Environment[];
};

const ALL: Environment[] = ["development", "staging", "production"];

// Fictional flags for a fictional fintech. No real customers, targeting rules, or rollout infrastructure.
export const SEED_FLAGS: SeedFlag[] = [
  { key: "instant_transfers_v2", name: "Instant transfers v2", description: "New real-time transfer rail with improved retry handling.", owner: "payments-platform", tags: ["payments", "transfers"], on: ["development", "staging"] },
  { key: "new_kyc_flow", name: "New KYC flow", description: "Redesigned identity verification steps for new account applications.", owner: "compliance-eng", tags: ["kyc", "onboarding"], on: ["development", "staging"] },
  { key: "refund_risk_check", name: "Refund risk check", description: "Score refund requests against risk rules before auto-approval.", owner: "risk-eng", tags: ["refunds", "risk"], on: ALL },
  { key: "card_freeze_self_service", name: "Card freeze self-service", description: "Let cardholders freeze and unfreeze cards from the app.", owner: "cards", tags: ["cards"], on: ALL },
  { key: "ach_same_day", name: "Same-day ACH", description: "Offer same-day ACH settlement for eligible transfers.", owner: "payments-platform", tags: ["payments", "ach"], on: ["development"] },
  { key: "dispute_auto_triage", name: "Dispute auto-triage", description: "Route card disputes to queues based on reason code.", owner: "risk-eng", tags: ["disputes", "risk"], on: ["development", "staging"] },
  { key: "mobile_biometric_login", name: "Mobile biometric login", description: "Face/fingerprint login on supported mobile devices.", owner: "mobile", tags: ["auth", "mobile"], on: ALL },
  { key: "statement_pdf_v3", name: "Statement PDF v3", description: "New monthly statement PDF renderer.", owner: "core-banking", tags: ["statements"], on: ["development"] },
  { key: "fx_rate_cache", name: "FX rate cache", description: "Cache FX quotes for 30 seconds to reduce provider calls.", owner: "payments-platform", tags: ["fx", "performance"], on: ALL },
  { key: "sanctions_screening_batch", name: "Batch sanctions screening", description: "Nightly batch re-screening of existing customers.", owner: "compliance-eng", tags: ["compliance", "kyc"], on: ["development", "staging"] },
  { key: "merchant_onboarding_wizard", name: "Merchant onboarding wizard", description: "Step-by-step onboarding for business accounts.", owner: "growth", tags: ["onboarding", "merchants"], on: [] },
  { key: "dashboard_dark_mode", name: "Dashboard dark mode", description: "Dark theme for the customer web dashboard.", owner: "web", tags: ["ui"], on: ["development", "staging"] },
  { key: "legacy_ledger_sync", name: "Legacy ledger sync", description: "Dual-write to the legacy ledger during migration. Candidate for archival.", owner: "core-banking", tags: ["ledger", "migration"], on: [] },
];

export function seed(db: DB): void {
  const now = new Date().toISOString();
  const insertFlag = db.prepare(
    `INSERT INTO flags (key, name, description, owner, tags, created_at, updated_at)
     VALUES (@key, @name, @description, @owner, @tags, @now, @now)`,
  );
  const insertEnv = db.prepare(
    "INSERT INTO flag_environments (flag_id, environment, enabled) VALUES (?, ?, ?)",
  );
  db.transaction(() => {
    for (const f of SEED_FLAGS) {
      const { lastInsertRowid } = insertFlag.run({ ...f, tags: JSON.stringify(f.tags), now });
      for (const env of ALL) insertEnv.run(lastInsertRowid, env, f.on.includes(env) ? 1 : 0);
    }
  })();
}
