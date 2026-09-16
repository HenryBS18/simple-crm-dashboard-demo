import {
  ACTIONS,
  apiResponseSchema,
  type CrmAction,
  type DataOf,
  type PayloadOf,
} from "@/lib/schema";

export class CrmError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CrmError";
  }
}

/* ── Penanda sumber data ───────────────────────────────────────────────────
   Route handler mengirim `x-crm-source` di setiap balasan. Nilainya disimpan
   di store kecil ini supaya badge "Data contoh" jujur bukan cuma saat
   NEXT_PUBLIC_DEMO_MODE menyala, tapi juga saat n8n mati di tengah demo.   */

export type CrmSource = "mock" | "n8n" | "unknown";

let currentSource: CrmSource = "unknown";
let fallbackReason = "";
const listeners = new Set<() => void>();

function setSource(source: CrmSource, reason: string) {
  if (source === currentSource && reason === fallbackReason) return;
  currentSource = source;
  fallbackReason = reason;
  for (const listener of listeners) listener();
}

export const crmSourceStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): CrmSource {
    return currentSource;
  },
  getServerSnapshot(): CrmSource {
    return "unknown";
  },
  getFallbackReason(): string {
    return fallbackReason;
  },
};

/* ── Client terketik ─────────────────────────────────────────────────────── */

export async function callCrm<A extends CrmAction>(
  action: A,
  payload: PayloadOf<A>,
): Promise<DataOf<A>> {
  const response = await fetch("/api/crm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });

  // Badge "Data contoh" bicara soal sumber papan, bukan tab Agen AI. Kedua
  // gateway bisa hidup terpisah, jadi kalau `ai.*` ikut menulis ke store ini
  // badge akan berkedip tiap antrian di-poll padahal papan sedang live.
  if (!action.startsWith("ai.")) {
    const header = response.headers.get("x-crm-source");
    const reasonHeader = response.headers.get("x-crm-fallback-reason");
    setSource(
      header === "n8n" ? "n8n" : header === "mock" ? "mock" : "unknown",
      reasonHeader ? decodeURIComponent(reasonHeader) : "",
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CrmError("BAD_RESPONSE", "Balasan server tidak bisa dibaca");
  }

  const envelope = apiResponseSchema(ACTIONS[action].data).safeParse(body);
  if (!envelope.success) {
    throw new CrmError(
      "SCHEMA_MISMATCH",
      `Bentuk data untuk "${action}" tidak sesuai kontrak`,
    );
  }

  if (!envelope.data.ok) {
    throw new CrmError(envelope.data.error.code, envelope.data.error.message);
  }

  return envelope.data.data as DataOf<A>;
}

/* ── Wrapper per action ──────────────────────────────────────────────────── */

export const bootstrap = () => callCrm("bootstrap", {});

export const listLeads = (payload: PayloadOf<"leads.list"> = {}) =>
  callCrm("leads.list", payload);

export const getLead = (id: string) => callCrm("leads.get", { id });

export const createLead = (payload: PayloadOf<"leads.create">) =>
  callCrm("leads.create", payload);

export const bulkCreateLeads = (payload: PayloadOf<"leads.bulkCreate">) =>
  callCrm("leads.bulkCreate", payload);

export const updateLead = (payload: PayloadOf<"leads.update">) =>
  callCrm("leads.update", payload);

export const moveLead = (payload: PayloadOf<"leads.move">) =>
  callCrm("leads.move", payload);

export const assignLead = (payload: PayloadOf<"leads.assign">) =>
  callCrm("leads.assign", payload);

export const deleteLead = (id: string) => callCrm("leads.delete", { id });

export const restoreLead = (id: string) => callCrm("leads.restore", { id });

export const createActivity = (payload: PayloadOf<"activities.create">) =>
  callCrm("activities.create", payload);

export const listSales = () => callCrm("sales.list", {});

export const upsertSales = (payload: PayloadOf<"sales.upsert">) =>
  callCrm("sales.upsert", payload);

export const statsSummary = () => callCrm("stats.summary", {});

/* ── Wrapper agen AI ─────────────────────────────────────────────────────── */

export const aiBootstrap = () => callCrm("ai.bootstrap", {});

export const searchProspects = (
  payload: PayloadOf<"ai.prospect.search"> = {},
) => callCrm("ai.prospect.search", payload);

export const draftFollowup = (payload: PayloadOf<"ai.draft.followup">) =>
  callCrm("ai.draft.followup", payload);

export const listAiTasks = (payload: PayloadOf<"ai.tasks.list"> = {}) =>
  callCrm("ai.tasks.list", payload);

export const generateAiTasks = (payload: PayloadOf<"ai.tasks.generate"> = {}) =>
  callCrm("ai.tasks.generate", payload);

export const createAiTask = (payload: PayloadOf<"ai.tasks.create">) =>
  callCrm("ai.tasks.create", payload);

export const decideAiTask = (payload: PayloadOf<"ai.tasks.decide">) =>
  callCrm("ai.tasks.decide", payload);
