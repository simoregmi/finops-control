export const ENVIRONMENTS = ["development", "staging", "production"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export interface Flag {
  key: string;
  name: string;
  description: string;
  owner: string;
  tags: string[];
  archived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  environments: Record<Environment, boolean>;
}

export interface AuditEvent {
  id: number;
  actor: string;
  action: string;
  resourceType: string;
  resourceKey: string;
  environment: Environment | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

/** A request to change a flag in production. It takes effect only when a different actor approves it. */
export interface ProductionChangeRequest {
  id: number;
  flagKey: string;
  flagName: string;
  requestedEnabled: boolean;
  previousEnabled: boolean;
  baseVersion: number;
  currentFlagVersion: number;
  /** Pending request whose flag changed after submission; it can no longer be approved. */
  stale: boolean;
  status: ApprovalStatus;
  requestedBy: string;
  requestedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: { path: string; message: string }[] };
}

/** Simulated identities for the demo. NOT authentication: any client can claim any of these. */
export const DEMO_ACTORS = [
  "alice.chen@finops.example",
  "bob.okafor@finops.example",
  "carmen.diaz@finops.example",
] as const;
export const DEMO_ACTOR_COOKIE = "finops_demo_actor";
export const DEMO_ACTOR_HEADER = "x-demo-actor";
