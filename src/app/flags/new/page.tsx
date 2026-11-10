import { NewFlagForm } from "./NewFlagForm";

export default function NewFlagPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">New feature flag</h1>
      <p className="text-sm text-slate-500">New flags start disabled in every environment.</p>
      <NewFlagForm />
    </div>
  );
}
