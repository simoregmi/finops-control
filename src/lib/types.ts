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
