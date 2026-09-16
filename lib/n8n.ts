import "server-only";

/**
 * Satu-satunya tempat `N8N_CRM_API_KEY` dibaca. Modul ini dijaga `server-only`
 * supaya import dari komponen client gagal saat build, bukan diam-diam
 * mengirim kunci ke browser.
 */

const TIMEOUT_MS = 8_000;

export type N8nOutcome =
  | { kind: "ok"; body: unknown }
  | { kind: "unavailable"; detail: string };

export function n8nConfigured(): boolean {
  return Boolean(process.env.N8N_CRM_URL && process.env.N8N_CRM_API_KEY);
}

export function demoModeForced(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export async function callN8n(
  action: string,
  payload: unknown,
): Promise<N8nOutcome> {
  const url = process.env.N8N_CRM_URL;
  const apiKey = process.env.N8N_CRM_API_KEY;
  if (!url || !apiKey) {
    return {
      kind: "unavailable",
      detail: "N8N_CRM_URL atau N8N_CRM_API_KEY belum diisi",
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ action, payload: payload ?? {} }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // 4xx dari gateway tetap membawa envelope error yang berguna
    // (VALIDATION_ERROR, NOT_FOUND). Itu jawaban sah, bukan backend mati.
    if (!response.ok && response.status >= 500) {
      return { kind: "unavailable", detail: `n8n membalas ${response.status}` };
    }

    const body = await response.json();
    if (!body || typeof body !== "object" || !("ok" in body)) {
      return {
        kind: "unavailable",
        detail: "Bentuk respons n8n tidak dikenal",
      };
    }
    return { kind: "ok", body };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { kind: "unavailable", detail };
  }
}
