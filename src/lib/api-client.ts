import type { ApiErrorBody } from "./types";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiErrorBody["error"] };

export async function api<T>(method: string, url: string, body?: unknown): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (res.ok) return { ok: true, data: json as T };
  return {
    ok: false,
    status: res.status,
    error: (json as ApiErrorBody | null)?.error ?? { code: "INTERNAL", message: `Request failed (${res.status})` },
  };
}

export function fieldErrors(error: ApiErrorBody["error"]): Record<string, string> {
  return Object.fromEntries((error.details ?? []).map((d) => [d.path, d.message]));
}
