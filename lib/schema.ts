import { z } from "zod";

/* ── Primitif toleran ──────────────────────────────────────────────────────
   n8n Data Table gampang mengembalikan angka/boolean sebagai string. Skema
   dibuat lenient supaya satu field yang bentuknya meleset tidak menjatuhkan
   seluruh papan saat demo.                                                  */

const id = z.union([z.string(), z.number()]).transform(String);
const text = z
  .unknown()
  .transform((v) => (v === null || v === undefined ? "" : String(v)));
const count = z.coerce.number().catch(0);
const flag = z
  .unknown()
  .transform((v) => v === true || v === "true" || v === 1 || v === "1");

export const stageSchema = z.enum(["todo", "in_progress", "won", "lost"]);
export const leadTypeSchema = z.enum(["B2B", "B2C"]);
export const activityTypeSchema = z.enum([
  "note",
  "call",
  "wa",
  "visit",
  "stage_change",
  "assign",
  "created",
]);
export type Stage = z.infer<typeof stageSchema>;
export type LeadType = z.infer<typeof leadTypeSchema>;
export type ActivityType = z.infer<typeof activityTypeSchema>;

/* ── Entitas ─────────────────────────────────────────────────────────────── */

export const leadSchema = z.object({
  id,
  name: text,
  type: leadTypeSchema.catch("B2C"),
  phone: text,
  phone_raw: text,
  address: text,
  source: text,
  stage: stageSchema.catch("todo"),
  owner_id: text,
  owner_name: text,
  order_count: count,
  notes: text,
  classify_reason: text,
  is_stale: flag,
  last_activity_at: text,
  created_at: text,
  updated_at: text,
});

export const activitySchema = z.object({
  id,
  lead_id: id,
  type: activityTypeSchema.catch("note"),
  content: text,
  actor: text,
  created_at: text,
});

export const salesSchema = z.object({
  id,
  name: text,
  // bootstrap tidak mengirim phone, sales.list mengirim.
  phone: text.optional().default(""),
  active: flag,
  lead_count: count,
});

export const stageInfoSchema = z.object({ key: text, label: text });

export type Lead = z.infer<typeof leadSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type Sales = z.infer<typeof salesSchema>;
export type StageInfo = z.infer<typeof stageInfoSchema>;

/* ── Envelope ────────────────────────────────────────────────────────────── */

export const metaSchema = z.object({ requestId: text, ts: text });
export const apiErrorSchema = z.object({ code: text, message: text });

export function apiResponseSchema<T extends z.ZodTypeAny>(data: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data, meta: metaSchema }),
    z.object({ ok: z.literal(false), error: apiErrorSchema, meta: metaSchema }),
  ]);
}

/* ── Payload + data per action ───────────────────────────────────────────── */

const empty = z.looseObject({});

const bootstrapData = z.object({
  stages: z.array(stageInfoSchema),
  sources: z.array(z.string()),
  types: z.array(leadTypeSchema),
  sales: z.array(salesSchema),
});

const leadsListPayload = z.object({
  type: leadTypeSchema.optional(),
  stage: stageSchema.optional(),
  ownerId: z.string().optional(),
  source: z.string().optional(),
  q: z.string().optional(),
  isStale: z.boolean().optional(),
  page: z.number().optional(),
  limit: z.number().optional(),
  sort: z.string().optional(),
});

const leadsListData = z.object({
  items: z.array(leadSchema),
  total: count,
  page: count,
  limit: count,
});

const leadsGetPayload = z.object({ id: z.string() });
const leadsGetData = z.object({
  lead: leadSchema,
  activities: z.array(activitySchema),
});

export const leadDraftSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi"),
  phone: z.string().trim().min(6, "Nomor wajib diisi"),
  address: z.string().trim().optional(),
  type: leadTypeSchema.optional(),
  source: z.string().optional(),
  orderCount: z.number().optional(),
  notes: z.string().optional(),
  ownerId: z.string().optional(),
});
export type LeadDraft = z.infer<typeof leadDraftSchema>;

const categorizationSchema = z.object({
  type: leadTypeSchema,
  reason: text,
});
const assignmentSchema = z.object({
  ownerId: text,
  ownerName: text,
  rule: text,
});

const leadsCreateData = z.object({
  lead: leadSchema,
  duplicate: flag,
  categorization: categorizationSchema.optional(),
  assignment: assignmentSchema.optional(),
});

const leadsBulkCreatePayload = z.object({ items: z.array(leadDraftSchema) });
const leadsBulkCreateData = z.object({
  created: count,
  duplicates: count,
  invalid: count,
  leads: z.array(leadSchema).default([]),
  duplicateLeads: z.array(leadSchema).default([]),
});

const leadsUpdatePayload = z.object({
  id: z.string(),
  patch: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    source: z.string().optional(),
    notes: z.string().optional(),
    order_count: z.number().optional(),
    type: leadTypeSchema.optional(),
    last_activity_at: z.string().optional(),
    is_stale: z.boolean().optional(),
  }),
});
const leadWithActivityData = z.object({
  lead: leadSchema,
  activity: activitySchema,
});

const leadsMovePayload = z.object({
  id: z.string(),
  stage: stageSchema,
  note: z.string().optional(),
  actor: z.string().optional(),
});

const leadsAssignPayload = z.object({
  id: z.string(),
  ownerId: z.string().optional(),
});
const leadsAssignData = z.object({
  lead: leadSchema,
  assignment: assignmentSchema.optional(),
  activity: activitySchema.optional(),
});

const activitiesCreatePayload = z.object({
  leadId: z.string(),
  type: activityTypeSchema,
  content: z.string().trim().min(1, "Catatan tidak boleh kosong"),
  actor: z.string().optional(),
});
const activitiesCreateData = z.object({
  activity: activitySchema,
  lead: leadSchema.optional(),
});

const salesListData = z.object({ sales: z.array(salesSchema) });

/** Bentuknya sudah persis form kelola sales, jadi dipakai langsung oleh
    react-hook-form lewat zodResolver — tidak perlu skema kedua. */
export const salesDraftSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Nama wajib diisi"),
  phone: z.string().optional(),
  active: z.boolean(),
});
export type SalesDraft = z.infer<typeof salesDraftSchema>;

const salesUpsertData = z.object({ sales: salesSchema });

const statsSummaryData = z.object({
  total: count,
  byStage: z.record(z.string(), count).default({}),
  byType: z.record(z.string(), count).default({}),
  bySource: z.record(z.string(), count).default({}),
  byOwner: z
    .array(
      z.object({
        ownerId: text,
        ownerName: text,
        total: count,
        won: count,
      }),
    )
    .default([]),
  staleCount: count,
  unassignedCount: count,
});

/* Satu peta yang mengunci tipe payload dan tipe data untuk setiap action.
   callCrm dan seluruh wrapper di lib/crm.ts diketik dari sini. */
export const ACTIONS = {
  bootstrap: { payload: empty, data: bootstrapData },
  "leads.list": { payload: leadsListPayload, data: leadsListData },
  "leads.get": { payload: leadsGetPayload, data: leadsGetData },
  "leads.create": { payload: leadDraftSchema, data: leadsCreateData },
  "leads.bulkCreate": {
    payload: leadsBulkCreatePayload,
    data: leadsBulkCreateData,
  },
  "leads.update": { payload: leadsUpdatePayload, data: leadWithActivityData },
  "leads.move": { payload: leadsMovePayload, data: leadWithActivityData },
  "leads.assign": { payload: leadsAssignPayload, data: leadsAssignData },
  // Hapus lead itu soft delete: barisnya diarsipkan, bukan dibuang. Kontrak
  // `Lead` sengaja tidak berubah — penanda arsipnya disaring di sisi n8n.
  "leads.delete": { payload: leadsGetPayload, data: leadWithActivityData },
  "leads.restore": { payload: leadsGetPayload, data: leadWithActivityData },
  "activities.create": {
    payload: activitiesCreatePayload,
    data: activitiesCreateData,
  },
  "sales.list": { payload: empty, data: salesListData },
  "sales.upsert": { payload: salesDraftSchema, data: salesUpsertData },
  "stats.summary": { payload: empty, data: statsSummaryData },
} as const;

export type CrmAction = keyof typeof ACTIONS;
export type PayloadOf<A extends CrmAction> = z.input<
  (typeof ACTIONS)[A]["payload"]
>;
export type DataOf<A extends CrmAction> = z.output<(typeof ACTIONS)[A]["data"]>;

export const crmActions = Object.keys(ACTIONS) as CrmAction[];

export function isCrmAction(value: unknown): value is CrmAction {
  return typeof value === "string" && value in ACTIONS;
}

export const requestSchema = z.object({
  action: z.string(),
  payload: z.unknown().optional(),
});

export type Categorization = z.infer<typeof categorizationSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
