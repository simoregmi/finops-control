import type { Metadata } from "next";
import Link from "next/link";
import { ActorSelect } from "@/components/ActorSelect";
import { countPendingRequests } from "@/server/approvals";
import { currentActorForDisplay } from "@/server/current-actor";
import { getDb } from "@/server/db";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinOps Control",
  description: "Feature-flag administration prototype (fictional data)",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActorForDisplay();
  const pendingApprovals = countPendingRequests(getDb());
  return (
    <html lang="en">
      <body>
        <div className="bg-amber-100 px-4 py-1 text-center text-xs text-amber-900">
          Prototype with fictional data. No real customers, production systems, or authentication.
        </div>
        <header className="bg-slate-900 text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-6">
              <Link href="/flags" className="text-lg font-semibold">
                FinOps Control
              </Link>
              <nav className="flex gap-4 text-sm text-slate-300">
                <Link href="/flags" className="hover:text-white">Feature flags</Link>
                <Link href="/approvals" className="hover:text-white">
                  Approvals
                  {pendingApprovals > 0 && (
                    <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-slate-900">{pendingApprovals}</span>
                  )}
                </Link>
                <Link href="/audit" className="hover:text-white">Audit log</Link>
              </nav>
            </div>
            <ActorSelect current={actor} />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
