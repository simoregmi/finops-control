import { DEMO_ACTORS } from "@/lib/types";
import { ServiceError } from "./errors";

/**
 * SIMULATED IDENTITY - NOT AUTHENTICATION.
 * The actor comes from a client-controlled header or cookie and can be spoofed by anyone.
 * It exists only so the audit log has a realistic "who". Replace with SSO/OIDC session
 * identity before any real use (see README "Production-hardening checklist").
 */
export function resolveActor(headerValue?: string | null, cookieValue?: string | null): string {
  const claimed = headerValue || cookieValue;
  if (!claimed) return DEMO_ACTORS[0];
  if (!(DEMO_ACTORS as readonly string[]).includes(claimed)) {
    throw new ServiceError("VALIDATION_FAILED", `Unknown demo actor '${claimed}'`, [
      { path: "actor", message: `Must be one of: ${DEMO_ACTORS.join(", ")}` },
    ]);
  }
  return claimed;
}
