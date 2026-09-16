import type { NextRequest } from "next/server";
import { callN8n } from "@/lib/n8n";
import { isCrmAction, requestSchema } from "@/lib/schema";

/** Proxy tidak boleh pernah di-prerender: isinya bergantung request. */
export const dynamic = "force-dynamic";

function meta() {
  return {
    requestId: Math.random().toString(36).slice(2, 10),
    ts: new Date().toISOString(),
  };
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: new Headers({
      "content-type": "application/json",
      "cache-control": "no-store",
    }),
  });
}

function fail(code: string, message: string, status: number) {
  return reply({ ok: false, error: { code, message }, meta: meta() }, status);
}

export async function POST(request: NextRequest): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("VALIDATION_ERROR", "Body harus JSON", 400);
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(
      "VALIDATION_ERROR",
      "Body harus berisi { action, payload }",
      400,
    );
  }

  const { action, payload } = parsed.data;
  if (!isCrmAction(action)) {
    return fail("UNKNOWN_ACTION", `Action "${action}" tidak dikenal`, 400);
  }

  const outcome = await callN8n(action, payload);
  if (outcome.kind === "ok") return reply(outcome.body);

  // Backend mati tidak boleh menyamar jadi data sungguhan. Lebih baik layar
  // error yang jujur daripada papan terisi yang diam-diam salah.
  return fail("BACKEND_UNAVAILABLE", outcome.detail, 503);
}
