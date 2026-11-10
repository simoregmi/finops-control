import { cookies } from "next/headers";
import { DEMO_ACTOR_COOKIE, DEMO_ACTORS } from "@/lib/types";

/** For display in server components only. Mutations resolve the actor per request in the API layer. */
export async function currentActorForDisplay(): Promise<string> {
  const value = (await cookies()).get(DEMO_ACTOR_COOKIE)?.value;
  return value && (DEMO_ACTORS as readonly string[]).includes(value) ? value : DEMO_ACTORS[0];
}
