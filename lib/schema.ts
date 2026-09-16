import { z } from "zod";
import type { AiTaskKind, AiTaskStatus, FollowupGoal } from "@/lib/ai-rules";

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

/* ── Agen AI ───────────────────────────────────────────────────────────────
   Daftar literalnya dikunci ke tipe di `lib/ai-rules.ts` lewat `satisfies`,
   jadi menambah goal atau jenis tugas di sana tanpa memperbarui skema ini
   akan gagal saat build, bukan diam-diam lolos ke runtime.                  */

const aiTaskKinds = [
  "prospect_batch",
  "followup",
  "stage_move",
] as const satisfies readonly AiTaskKind[];
export const aiTaskKindSchema = z.enum(aiTaskKinds);

const aiTaskStatuses = [
  "pending",
  "approved",
  "rejected",
  "failed",
] as const satisfies readonly AiTaskStatus[];
export const aiTaskStatusSchema = z.enum(aiTaskStatuses);

const followupGoals = [
  "perkenalan",
  "tindak_lanjut_penawaran",
  "repeat_order",
  "reaktivasi",
] as const satisfies readonly FollowupGoal[];
export const followupGoalSchema = z.enum(followupGoals);

/** Payload dan hasil tugas disimpan sebagai JSON string di data table n8n,
    jadi bentuknya dibiarkan longgar di sini dan dipersempit saat dibaca. */
const loose = z.record(z.string(), z.unknown());

const scorePartSchema = z.object({
  key: text,
  label: text,
  points: count,
  max: count,
});

/** Kategori dan area sengaja `text`, bukan enum: kolam prospek bisa tumbuh di
    n8n tanpa menjatuhkan seluruh tabel hasil. Labelnya ikut dikirim. */
export const prospectCandidateSchema = z.object({
  prospectId: id,
  name: text,
  category: text,
  categoryLabel: text,
  area: text,
  areaLabel: text,
  address: text,
  phone: text,
  phoneRaw: text,
  rating: count,
  reviewCount: count,
  unitCount: count,
  unitLabel: text,
  priceBand: text,
  priceNote: text,
  sourceLabel: text,
  listingUrl: text,
  hasWhatsapp: flag,
  verified: flag,
  lastSeenAt: text,
  lastSeenLabel: text,
  keywords: z.array(z.string()).catch([]),
  notes: text,
  score: count,
  scoreTier: text,
  scoreReason: text,
  scoreParts: z.array(scorePartSchema).catch([]),
  matchScore: count,
  matchedOn: z.array(z.string()).catch([]),
  status: text,
  alreadyInCrm: flag,
  existingLeadId: text,
  leadDraft: z.object({
    name: text,
    phone: text,
    address: text,
    source: text,
    notes: text,
  }),
});

export const aiTaskSchema = z.object({
  id,
  kind: aiTaskKindSchema.catch("followup"),
  status: aiTaskStatusSchema.catch("pending"),
  title: text,
  reason: text,
  priority: count,
  leadId: text,
  leadName: text,
  payload: loose.catch({}),
  result: loose.nullable().catch(null),
  dedupeKey: text,
  runId: text,
  actor: text,
  createdAt: text,
  decidedAt: text,
  executedAt: text,
});

export const agentStepSchema = z.object({
  key: text,
  label: text,
  detail: text,
  count: z.coerce.number().nullable().catch(null),
  ms: count,
});

/* Hasil `ai.tasks.decide` per jenis. Dipakai untuk mempersempit `task.result`
   di komponen — bukan bagian dari envelope, jadi tidak dipasang di ACTIONS. */

export const prospectBatchResultSchema = z.object({
  kind: z.literal("prospect_batch"),
  created: count,
  duplicates: count,
  // `invalid` dikirim n8n sebagai array, dan kontrak lama memaksanya jadi
  // angka sehingga selalu terbaca 0. Di sini angkanya dan daftarnya dipisah.
  invalid: count,
  invalidItems: z
    .array(z.object({ name: text, phone_raw: text, reason: text }))
    .catch([]),
  leads: z.array(leadSchema).catch([]),
  duplicateLeads: z.array(leadSchema).catch([]),
  categorizations: z
    .array(z.object({ leadId: text, type: text, reason: text }))
    .catch([]),
  assignments: z
    .array(
      z.object({
        leadId: text,
        ownerId: text,
        ownerName: text,
        rule: text,
      }),
    )
    .catch([]),
  prospectIds: z.array(z.string()).catch([]),
  convertedProspects: count,
});

export const followupResultSchema = z.object({
  kind: z.literal("followup"),
  activity: activitySchema,
  lead: leadSchema,
  waUrl: text,
  text: text,
});

export const stageMoveResultSchema = z.object({
  kind: z.literal("stage_move"),
  lead: leadSchema,
  activity: activitySchema,
  from: text,
  to: text,
});

const aiBootstrapData = z.object({
  areas: z.array(z.object({ key: text, label: text, count })).catch([]),
  categories: z.array(z.object({ key: text, label: text, count })).catch([]),
  goals: z.array(z.object({ key: text, label: text })).catch([]),
  taskKinds: z.array(z.object({ key: text, label: text })).catch([]),
  templates: z.array(z.object({ id: text, goal: text, label: text })).catch([]),
  pool: z.record(z.string(), count).catch({}),
  tasks: z.record(z.string(), count).catch({}),
  // Bobot dan ambang ikut dikirim supaya panel "cara skor dihitung" di UI
  // tidak perlu menghardcode angka yang bisa berbeda dari backend.
  scoring: z
    .object({
      weights: z.record(z.string(), count).catch({}),
      tiers: z.array(z.object({ min: count, label: text })).catch([]),
    })
    .catch({ weights: {}, tiers: [] }),
});

const aiProspectSearchPayload = z.object({
  query: z.string().optional(),
  area: z.string().optional(),
  category: z.string().optional(),
  limit: z.number().optional(),
  includeUsed: z.boolean().optional(),
  minScore: z.number().optional(),
});
const aiProspectSearchData = z.object({
  runId: text,
  query: text,
  filters: z.object({ area: text, category: text, minScore: count }),
  total: count,
  returned: count,
  tookMs: count,
  sources: z.array(z.object({ label: text, count })).catch([]),
  steps: z.array(agentStepSchema).catch([]),
  candidates: z.array(prospectCandidateSchema).catch([]),
});

const aiDraftFollowupPayload = z.object({
  leadId: z.string(),
  goal: followupGoalSchema.optional(),
});
const aiDraftFollowupData = z.object({
  lead: leadSchema,
  draft: z.object({
    templateId: text,
    goal: followupGoalSchema.catch("perkenalan"),
    goalLabel: text,
    channel: text,
    text: text,
    reason: text,
    waUrl: text,
    vars: loose.catch({}),
  }),
  alternatives: z.array(z.object({ goal: text, goalLabel: text })).catch([]),
});

const aiTasksListPayload = z.object({
  status: aiTaskStatusSchema.optional(),
  kind: aiTaskKindSchema.optional(),
  leadId: z.string().optional(),
  limit: z.number().optional(),
});
const aiTasksListData = z.object({
  items: z.array(aiTaskSchema).catch([]),
  total: count,
  counts: z.record(z.string(), count).catch({}),
});

const aiTasksGeneratePayload = z.object({
  kinds: z.array(aiTaskKindSchema).optional(),
});
const aiTasksGenerateData = z.object({
  runId: text,
  scanned: z.record(z.string(), count).catch({}),
  created: count,
  skipped: count,
  items: z.array(aiTaskSchema).catch([]),
  skippedReasons: z
    .array(z.object({ dedupeKey: text, reason: text }))
    .catch([]),
});

const aiTasksCreatePayload = z.object({
  kind: aiTaskKindSchema,
  leadId: z.string().optional(),
  prospectIds: z.array(z.string()).optional(),
  goal: followupGoalSchema.optional(),
  text: z.string().optional(),
  stage: stageSchema.optional(),
  note: z.string().optional(),
  actor: z.string().optional(),
});
/** Duplikat bukan error, sama seperti `leads.create`: tugas yang sudah
    mengantri dikembalikan apa adanya dengan `duplicate: true`. */
const aiTasksCreateData = z.object({
  task: aiTaskSchema,
  duplicate: flag,
});

const aiTasksDecidePayload = z.object({
  id: z.string(),
  decision: z.enum(["approve", "reject"]),
  actor: z.string().optional(),
  // Operator hampir selalu menyunting draf sebelum menyetujui. Tanpa ini,
  // activity yang tercatat tidak sama dengan pesan yang benar-benar dikirim.
  overrides: z
    .object({
      text: z.string().optional(),
      stage: stageSchema.optional(),
      prospectIds: z.array(z.string()).optional(),
    })
    .optional(),
});
const aiTasksDecideData = z.object({
  task: aiTaskSchema,
  result: loose.nullable().catch(null),
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
  /* Action agen dilayani gateway n8n kedua (`CRM AI Gateway`). Prefiks `ai.`
     yang dipakai `lib/n8n.ts` untuk memilih URL — jangan dipakai untuk action
     yang dilayani gateway lama. */
  "ai.bootstrap": { payload: empty, data: aiBootstrapData },
  "ai.prospect.search": {
    payload: aiProspectSearchPayload,
    data: aiProspectSearchData,
  },
  "ai.draft.followup": {
    payload: aiDraftFollowupPayload,
    data: aiDraftFollowupData,
  },
  "ai.tasks.list": { payload: aiTasksListPayload, data: aiTasksListData },
  "ai.tasks.generate": {
    payload: aiTasksGeneratePayload,
    data: aiTasksGenerateData,
  },
  "ai.tasks.create": { payload: aiTasksCreatePayload, data: aiTasksCreateData },
  "ai.tasks.decide": { payload: aiTasksDecidePayload, data: aiTasksDecideData },
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

export type ProspectCandidate = z.infer<typeof prospectCandidateSchema>;
export type AiTask = z.infer<typeof aiTaskSchema>;
export type AgentStep = z.infer<typeof agentStepSchema>;
export type ProspectBatchResult = z.infer<typeof prospectBatchResultSchema>;
export type FollowupResult = z.infer<typeof followupResultSchema>;
export type StageMoveResult = z.infer<typeof stageMoveResultSchema>;
