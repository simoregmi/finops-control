import Link from "next/link";
import { DataTable } from "@/components/ui/DataTable";
import { inputClass } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Alert } from "@/components/ui/Alert";
import { ENVIRONMENTS, type Flag } from "@/lib/types";
import { getDb } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { listFlags } from "@/server/flags";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | undefined>>;

export default async function FlagsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const filters = {
    q: sp.q || undefined,
    environment: sp.environment || undefined,
    status: sp.status || undefined,
    includeArchived: sp.archived === "1",
  };
  let flags: Flag[] = [];
  let error: string | null = null;
  try {
    flags = listFlags(getDb(), filters);
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
    error = e.details?.map((d) => `${d.path}: ${d.message}`).join("; ") ?? e.message;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Feature flags</h1>
          <p className="text-sm text-slate-500">{flags.length} flag{flags.length === 1 ? "" : "s"}</p>
        </div>
        <Link href="/flags/new" className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          New flag
        </Link>
      </div>

      <form className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-5" method="get">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search key, name, owner, tag" className={`${inputClass} sm:col-span-2`} aria-label="Search" />
        <select name="environment" defaultValue={sp.environment ?? ""} className={inputClass} aria-label="Environment">
          <option value="">Any environment</option>
          {ENVIRONMENTS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? "all"} className={inputClass} aria-label="Status">
          <option value="all">Any status</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>
        <div className="flex items-center gap-3">
          <button className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700" type="submit">Apply</button>
          <Link href="/flags" className="text-sm text-slate-600 hover:underline">Reset</Link>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-5">
          <input type="checkbox" name="archived" value="1" defaultChecked={sp.archived === "1"} /> Include archived flags
          <span className="text-slate-400">· Environment narrows the status filter; with no environment, “Disabled” means off everywhere.</span>
        </label>
      </form>

      {error && <Alert tone="error">Invalid filter: {error}</Alert>}

      <DataTable
        rows={flags}
        rowKey={(f) => f.key}
        empty="No flags match these filters."
        columns={[
          {
            header: "Flag",
            cell: (f) => (
              <div>
                <Link href={`/flags/${f.key}`} className="font-mono text-sm font-medium text-indigo-700 hover:underline">{f.key}</Link>
                {f.archived && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">archived</span>}
                <div className="text-xs text-slate-500">{f.name}</div>
              </div>
            ),
          },
          { header: "Owner", cell: (f) => <span className="text-xs">{f.owner}</span> },
          ...ENVIRONMENTS.map((env) => ({ header: env, cell: (f: Flag) => <StatusBadge enabled={f.environments[env]} /> })),
          { header: "Tags", cell: (f) => <span className="text-xs text-slate-500">{f.tags.join(", ")}</span> },
          { header: "Ver.", cell: (f) => <span className="font-mono text-xs">v{f.version}</span> },
        ]}
      />
    </div>
  );
}
