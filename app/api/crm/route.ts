import type { NextRequest } from "next/server";
import { handleMockAction, MockError } from "@/lib/mock";
import { callN8n, demoModeForced, n8nConfigured } from "@/lib/n8n";
import { isCrmAction, requestSchema } from "@/lib/schema";

/** Proxy tidak boleh pernah di-prerender: isinya bergantung request. */
export const dynamic = "force-dynamic";

export type CrmSource = "mock" | "n8n";

function meta() {
  return {
    requestId: Math.random().toString(36).slice(2, 10),
    ts: new Date().toISOString(),
  };
}

function reply(
  body: unknown,
  source: CrmSource,
  status = 200,
  note?: string,
): Response {
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": "no-store",
    // Penanda sumber dikirim lewat header, bukan lewat `meta`, supaya kontrak
    // JSON yang sudah dikunci tidak berubah bentuk.
    "x-crm-source": source,
  });
  if (note) headers.set("x-crm-fallback-reason", encodeURIComponent(note));
  return new Response(JSON.stringify(body), { status, headers });
}

function fail(
  code: string,
  message: string,
  status: number,
  source: CrmSource,
) {
  return reply(
    { ok: false, error: { code, message }, meta: meta() },
    source,
    status,
  );
}

function serveFromMock(
  action: string,
  payload: unknown,
  note?: string,
): Response {
  // Afordans dev: bikin satu action sengaja gagal supaya rollback optimistic
  // bisa benar-benar diuji, bukan sekadar diklaim.
  if (process.env.CRM_MOCK_FAIL && process.env.CRM_MOCK_FAIL === action) {
    return fail(
      "INTERNAL_ERROR",
      `Action "${action}" sengaja digagalkan lewat CRM_MOCK_FAIL`,
      500,
      "mock",
    );
  }

  try {
    const data = handleMockAction(action, payload);
    return reply({ ok: true, data, meta: meta() }, "mock", 200, note);
  } catch (error) {
    if (error instanceof MockError) {
      const status =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "UNKNOWN_ACTION"
            ? 400
            : 400;
      return fail(error.code, error.message, status, "mock");
    }
    return fail(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "Kesalahan tidak terduga",
      500,
      "mock",
    );
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("VALIDATION_ERROR", "Body harus JSON", 400, "mock");
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(
      "VALIDATION_ERROR",
      "Body harus berisi { action, payload }",
      400,
      "mock",
    );
  }

  const { action, payload } = parsed.data;
  if (!isCrmAction(action)) {
    return fail(
      "UNKNOWN_ACTION",
      `Action "${action}" tidak dikenal`,
      400,
      "mock",
    );
  }

  if (demoModeForced() || !n8nConfigured(action)) {
    return serveFromMock(action, payload);
  }

  const outcome = await callN8n(action, payload);
  if (outcome.kind === "ok") {
    return reply(outcome.body, "n8n");
  }

  // Backend mati di tengah demo tidak boleh menghasilkan layar kosong.
  return serveFromMock(action, payload, outcome.detail);
}
