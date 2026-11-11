"use client";

import { useRouter } from "next/navigation";
import { DEMO_ACTOR_COOKIE, DEMO_ACTORS } from "@/lib/types";

export function ActorSelect({ current }: { current: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-xs text-slate-300">
      <span title="Demo only. Anyone can pick any identity; this is not authentication.">
        Simulated identity <span className="text-amber-300">(not authentication)</span>
      </span>
      <select
        className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-white"
        value={current}
        onChange={(e) => {
          document.cookie = `${DEMO_ACTOR_COOKIE}=${encodeURIComponent(e.target.value)}; path=/; samesite=lax`;
          router.refresh();
        }}
      >
        {DEMO_ACTORS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </label>
  );
}
