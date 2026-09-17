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

/**
 * Action `ai.*` dilayani workflow kedua (`CRM AI Gateway`) di URL sendiri.
 * Gateway lama sudah ~100 ribu karakter JSON dan menopang seluruh papan;
 * menambah cabang ke dalamnya lewat API berarti menulis ulang seluruh
 * workflow untuk perubahan yang sifatnya menambah saja.
 *
 * Konsekuensi yang memang diinginkan: kalau `N8N_CRM_AI_URL` kosong, action
 * `ai.*` membalas 503 lewat `callN8n` di bawah — papan tetap live karena
 * dilayani `N8N_CRM_URL` yang terpisah.
 */
function urlFor(action: string): string | undefined {
  if (action.startsWith("ai.")) return process.env.N8N_CRM_AI_URL;
  if (action.startsWith("demo.")) return process.env.N8N_CRM_RESET_URL;
  return process.env.N8N_CRM_URL;
}

function urlNameFor(action: string): string {
  if (action.startsWith("ai.")) return "N8N_CRM_AI_URL";
  if (action.startsWith("demo.")) return "N8N_CRM_RESET_URL";
  return "N8N_CRM_URL";
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
  const url = urlFor(action);
  const url = process.env.N8N_CRM_URL;
  const apiKey = process.env.N8N_CRM_API_KEY;
  if (!url || !apiKey) {
    return {
      kind: "unavailable",
      detail: `${urlNameFor(action)} atau N8N_CRM_API_KEY belum diisi`,
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
