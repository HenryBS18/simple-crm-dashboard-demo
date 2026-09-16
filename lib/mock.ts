import {
  type AiTaskKind,
  AREA_LABELS,
  CATEGORY_LABELS,
  dedupeKeyFor,
  type FollowupGoal,
  GOAL_LABELS,
  generateTasks,
  matchProspect,
  PROSPECT_SEED,
  type ProspectRow,
  pickGoal,
  renderDraft,
  SCORE_TIERS,
  SCORE_WEIGHTS,
  scoreProspect,
  seedToRow,
  TASK_KIND_LABELS,
  TEMPLATE_IDS,
  toCandidate,
} from "@/lib/ai-rules";
import { normalizePhone, waLink } from "@/lib/format";
import type {
  Activity,
  ActivityType,
  AgentStep,
  AiTask,
  Lead,
  LeadType,
  ProspectCandidate,
  Sales,
  Stage,
} from "@/lib/schema";
import { FALLBACK_STAGES, STAGE_LABELS } from "@/lib/stage";

/* ── Store in-memory ───────────────────────────────────────────────────────
   Mock ini stateful, bukan array statis: kalau hanya bisa dibaca, seluruh
   tombol mati begitu backend tidak dipakai dan demo tidak bisa jalan.
   Konsekuensi yang disadari: state hilang saat server restart / HMR, dan
   tidak konsisten kalau di-deploy multi-instance.                          */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Store = {
  leads: Lead[];
  /** Lead yang dihapus pindah ke sini, bukan hilang — supaya setiap pembaca
      yang memakai `leads` otomatis tidak melihatnya dan restore tetap mungkin. */
  archived: Lead[];
  activities: Activity[];
  sales: Sales[];
  nextLeadId: number;
  nextActivityId: number;
  nextSalesId: number;
  roundRobin: number;
  /** Kolam prospek dan antrian usulan agen. Di mode live keduanya tinggal di
      data table `crm_prospects` dan `crm_ai_tasks`. */
  prospects: ProspectRow[];
  aiTasks: AiTask[];
  nextAiTaskId: number;
};

const SOURCES = [
  "meta_ads",
  "dm",
  "organic",
  "komunitas",
  "canvassing",
  "referral",
  "manual",
];

function seed(): Store {
  const now = Date.now();
  const iso = (offset: number) => new Date(now - offset).toISOString();

  const sales: Sales[] = [
    {
      id: "1",
      name: "Rangga",
      phone: "6281200000001",
      active: true,
      lead_count: 0,
    },
    {
      id: "2",
      name: "Sinta",
      phone: "6281200000002",
      active: true,
      lead_count: 0,
    },
    {
      id: "3",
      name: "Dewi",
      phone: "6281200000003",
      active: true,
      lead_count: 0,
    },
    {
      id: "4",
      name: "Fajar",
      phone: "6281200000004",
      active: true,
      lead_count: 0,
    },
  ];

  type SeedLead = {
    name: string;
    type: LeadType;
    raw: string;
    address: string;
    source: string;
    stage: Stage;
    owner: string;
    orders: number;
    notes: string;
    reason: string;
    idleDays: number;
    stale?: boolean;
  };

  const rows: SeedLead[] = [
    {
      name: "Ova Villa",
      type: "B2B",
      raw: "0812-2211-4478",
      address: "Jl. Kolonel Masturi No. 88, Cisarua, Lembang",
      source: "canvassing",
      stage: "todo",
      owner: "1",
      orders: 0,
      notes: "Minta penawaran untuk 12 unit villa.",
      reason: 'Nama mengandung kata "villa", dikategorikan B2B',
      idleDays: 0,
    },
    {
      name: "Jack Villa Lembang dan Dago",
      type: "B2B",
      raw: "0815-1374-5378",
      address: "Pengelola Villa Lembang & Dago Area",
      source: "komunitas",
      stage: "todo",
      owner: "2",
      orders: 0,
      notes: "Pegang beberapa properti sewa harian.",
      reason:
        'Nama mengandung kata "villa" dan mengelola banyak unit, dikategorikan B2B',
      idleDays: 0,
    },
    {
      name: "Disella",
      type: "B2C",
      raw: "0821-1111-9124",
      address: "Permata Kopo 1 Blok H no 50, Bandung",
      source: "referral",
      stage: "todo",
      owner: "3",
      orders: 6,
      notes: "Repeat order, biasanya pesan tiap awal bulan.",
      reason: "Pembelian atas nama pribadi, 6x order, dikategorikan B2C",
      idleDays: 0,
    },
    {
      name: "Rizky Aditya",
      type: "B2C",
      raw: "0813-9042-1166",
      address: "Jl. Cihampelas No. 140, Bandung",
      source: "meta_ads",
      stage: "todo",
      owner: "",
      orders: 0,
      notes: "Belum ada sales, baru masuk dari iklan.",
      reason:
        "Pembelian atas nama pribadi, belum pernah order, dikategorikan B2C",
      idleDays: 12,
      stale: true,
    },
    {
      name: "Grand Sunrise Resort",
      type: "B2B",
      raw: "0811-2233-7788",
      address: "Jl. Raya Ciwidey KM 12, Bandung Selatan",
      source: "referral",
      stage: "in_progress",
      owner: "1",
      orders: 0,
      notes: "Sudah kirim proposal, menunggu keputusan manajemen.",
      reason: 'Nama mengandung kata "resort", dikategorikan B2B',
      idleDays: 1,
    },
    {
      name: "Bella",
      type: "B2C",
      raw: "0877-2286-3562",
      address: "Villa Lembang, Blok C No. 4",
      source: "dm",
      stage: "in_progress",
      owner: "3",
      orders: 2,
      notes: "Tanya stok warna, minta dikirim katalog.",
      reason:
        'Kata "villa" hanya ada di alamat, sudah 2x order, dikategorikan B2C',
      idleDays: 0,
    },
    {
      name: "Shauma",
      type: "B2C",
      raw: "0881-0221-32633",
      address: "Pasir Salam, Regol, Bandung",
      source: "meta_ads",
      stage: "in_progress",
      owner: "4",
      orders: 1,
      notes: "Sudah transfer DP.",
      reason: "Pembelian atas nama pribadi, 1x order, dikategorikan B2C",
      idleDays: 9,
      stale: true,
    },
    {
      name: "Dapur Ibu Ratna",
      type: "B2B",
      raw: "0856-7711-2043",
      address: "Jl. Buah Batu No. 219, Bandung",
      source: "organic",
      stage: "won",
      owner: "2",
      orders: 0,
      notes: "Closing 200 pcs, kirim minggu depan.",
      reason: 'Nama usaha katering ("dapur"), volume besar, dikategorikan B2B',
      idleDays: 2,
    },
    {
      name: "Nadia Pramesti",
      type: "B2C",
      raw: "0838-4455-9010",
      address: "Antapani Kidul, Bandung",
      source: "organic",
      stage: "won",
      owner: "3",
      orders: 3,
      notes: "Langganan, bayar lunas di muka.",
      reason: "Pembelian atas nama pribadi, 3x order, dikategorikan B2C",
      idleDays: 3,
    },
    {
      name: "ApVoucher Villa",
      type: "B2B",
      raw: "0821-8888-7245",
      address: "Pengelola Villa Lembang & Dago Area",
      source: "komunitas",
      stage: "lost",
      owner: "4",
      orders: 0,
      notes: "Harga tidak cocok, pakai vendor lama.",
      reason: 'Nama mengandung kata "villa", dikategorikan B2B',
      idleDays: 5,
    },
  ];

  const leads: Lead[] = rows.map((row, index) => {
    const lastActivity = iso(row.idleDays * DAY + index * HOUR);
    return {
      id: String(index + 1),
      name: row.name,
      type: row.type,
      phone: normalizePhone(row.raw),
      phone_raw: row.raw,
      address: row.address,
      source: row.source,
      stage: row.stage,
      owner_id: row.owner,
      owner_name: sales.find((s) => s.id === row.owner)?.name ?? "",
      order_count: row.orders,
      notes: row.notes,
      classify_reason: row.reason,
      is_stale: row.stale === true,
      last_activity_at: lastActivity,
      created_at: iso((row.idleDays + 14) * DAY),
      updated_at: lastActivity,
    };
  });

  const activities: Activity[] = [];
  let activityId = 1;
  for (const lead of leads) {
    activities.push({
      id: String(activityId++),
      lead_id: lead.id,
      type: "created",
      content: `Lead masuk dari ${lead.source}, dikategorikan ${lead.type}${
        lead.owner_name ? `, dipegang ${lead.owner_name}` : ""
      }`,
      actor: "system",
      created_at: lead.created_at,
    });
    if (lead.stage !== "todo") {
      activities.push({
        id: String(activityId++),
        lead_id: lead.id,
        type: "stage_change",
        content: `To Do -> ${STAGE_LABELS[lead.stage]}`,
        actor: lead.owner_name || "system",
        created_at: lead.last_activity_at,
      });
    }
    if (lead.notes) {
      activities.push({
        id: String(activityId++),
        lead_id: lead.id,
        type: "note",
        content: lead.notes,
        actor: lead.owner_name || "system",
        created_at: lead.last_activity_at,
      });
    }
  }

  for (const s of sales) {
    s.lead_count = leads.filter((l) => l.owner_id === s.id).length;
  }

  return {
    leads,
    archived: [],
    activities,
    sales,
    nextLeadId: leads.length + 1,
    nextActivityId: activityId,
    nextSalesId: sales.length + 1,
    roundRobin: 0,
    prospects: PROSPECT_SEED.map((row, index) =>
      seedToRow(row, String(index + 1)),
    ),
    aiTasks: [],
    nextAiTaskId: 1,
  };
}

const globalStore = globalThis as unknown as { __crmMock?: Store };
function store(): Store {
  globalStore.__crmMock ??= seed();
  // Store lama yang masih nyangkut di global setelah HMR belum punya `archived`.
  globalStore.__crmMock.archived ??= [];
  // Store yang nyangkut dari sebelum fitur agen ada belum punya tiga ini.
  globalStore.__crmMock.prospects ??= PROSPECT_SEED.map((row, index) =>
    seedToRow(row, String(index + 1)),
  );
  globalStore.__crmMock.aiTasks ??= [];
  globalStore.__crmMock.nextAiTaskId ??= 1;
  return globalStore.__crmMock;
}

/* ── Helper ──────────────────────────────────────────────────────────────── */

export class MockError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function touch(lead: Lead, at = new Date().toISOString()) {
  lead.last_activity_at = at;
  lead.updated_at = at;
  lead.is_stale = false;
}

function addActivity(
  leadId: string,
  type: ActivityType,
  content: string,
  actor: string,
): Activity {
  const s = store();
  const activity: Activity = {
    id: String(s.nextActivityId++),
    lead_id: leadId,
    type,
    content,
    actor: actor || "system",
    created_at: new Date().toISOString(),
  };
  s.activities.push(activity);
  return activity;
}

function requireLead(id: string): Lead {
  const lead = store().leads.find((l) => l.id === id);
  if (!lead) throw new MockError("NOT_FOUND", `Lead ${id} tidak ditemukan`);
  return lead;
}

function recountSales() {
  const s = store();
  for (const person of s.sales) {
    person.lead_count = s.leads.filter((l) => l.owner_id === person.id).length;
  }
}

/**
 * Disalin apa adanya dari node `Plan Intake` di n8n: daftar katanya, batas
 * kata `\\b...\\b`, dan rumus skornya. Sebelumnya mock memakai daftar lebih
 * pendek dengan pencocokan substring dan putusan hit-pertama, sehingga
 * "Glamping Ranca Upas Pinus" jadi B2B di mode live tapi B2C di mode contoh.
 * Perbedaan itu tidak bisa dibiarkan lagi karena alasan kategori sekarang
 * ikut ditampilkan sebagai hasil kerja agen.
 */
const B2B_KEYWORDS = [
  "villa",
  "resort",
  "glamping",
  "hotel",
  "homestay",
  "resto",
  "cafe",
  "kafe",
  "pengelola",
  "agent",
  "toko",
  "cv",
  "pt",
  "ud",
  "catering",
  "reseller",
  "distributor",
];

function keywordHits(value: string): string[] {
  const haystack = String(value ?? "").toLowerCase();
  return B2B_KEYWORDS.filter((kw) =>
    new RegExp(`\\b${kw}\\b`, "i").test(haystack),
  );
}

function classify(
  name: string,
  address: string,
  orderCount: number,
): { type: LeadType; reason: string } {
  const nameHits = keywordHits(name);
  const addrHits = keywordHits(address).filter((k) => !nameHits.includes(k));
  let score = nameHits.length * 2 + addrHits.length;
  if (orderCount > 0) score -= 2;
  const type: LeadType = score > 0 ? "B2B" : "B2C";

  const parts: string[] = [];
  if (nameHits.length) {
    parts.push(
      `Nama mengandung kata ${nameHits.map((k) => `"${k}"`).join(", ")}`,
    );
  }
  if (addrHits.length) {
    parts.push(
      `Kata ${addrHits.map((k) => `"${k}"`).join(", ")} hanya ada di alamat`,
    );
  }
  if (orderCount > 0) parts.push(`sudah ${orderCount}x order`);
  if (!parts.length) {
    parts.push("Tidak ada kata kunci bisnis di nama maupun alamat");
  }

  return { type, reason: `${parts.join(", ")}, dikategorikan ${type}` };
}

// Beban terkecil menang, seri dipecah alfabetis — sama persis dengan n8n,
// supaya mode demo dan mode live tidak memberi owner berbeda.
function autoAssign(): Sales | undefined {
  const s = store();
  const eligible = s.sales.filter((p) => p.active);
  if (eligible.length === 0) return undefined;
  return [...eligible].sort(
    (a, b) => a.lead_count - b.lead_count || a.name.localeCompare(b.name),
  )[0];
}

function createLead(payload: Record<string, unknown>) {
  const s = store();
  const name = str(payload.name).trim();
  const rawPhone = str(payload.phone).trim();
  if (!name || !rawPhone) {
    throw new MockError("VALIDATION_ERROR", "name dan phone wajib diisi");
  }

  const phone = normalizePhone(rawPhone);
  const existing = s.leads.find((l) => l.phone === phone);
  if (existing) return { lead: existing, duplicate: true as const };

  const address = str(payload.address);
  const orderCount = num(payload.orderCount);
  const forcedType = str(payload.type);
  const categorization =
    forcedType === "B2B" || forcedType === "B2C"
      ? { type: forcedType as LeadType, reason: "Tipe ditetapkan manual" }
      : classify(name, address, orderCount);

  const forcedOwner = str(payload.ownerId);
  const owner = forcedOwner
    ? s.sales.find((p) => p.id === forcedOwner)
    : autoAssign();

  const now = new Date().toISOString();
  const lead: Lead = {
    id: String(s.nextLeadId++),
    name,
    type: categorization.type,
    phone,
    phone_raw: rawPhone,
    address,
    source: str(payload.source, "manual"),
    stage: "todo",
    owner_id: owner?.id ?? "",
    owner_name: owner?.name ?? "",
    order_count: orderCount,
    notes: str(payload.notes),
    classify_reason: categorization.reason,
    is_stale: false,
    last_activity_at: now,
    created_at: now,
    updated_at: now,
  };
  s.leads.push(lead);
  recountSales();

  addActivity(
    lead.id,
    "created",
    `Lead masuk dari ${lead.source}, dikategorikan ${lead.type}${
      owner ? `, dipegang ${owner.name}` : ""
    }`,
    "system",
  );

  return {
    lead,
    duplicate: false as const,
    categorization,
    assignment: owner
      ? {
          ownerId: owner.id,
          ownerName: owner.name,
          rule: forcedOwner ? "manual" : "auto_round_robin",
        }
      : { ownerId: "", ownerName: "", rule: "no_match" },
  };
}

/* ── Dispatcher ──────────────────────────────────────────────────────────── */

export function handleMockAction(action: string, rawPayload: unknown): unknown {
  const payload = asRecord(rawPayload);
  const s = store();

  switch (action) {
    case "bootstrap":
      return {
        stages: FALLBACK_STAGES,
        sources: SOURCES,
        types: ["B2B", "B2C"],
        sales: s.sales.map(({ id, name, active, lead_count }) => ({
          id,
          name,
          active,
          lead_count,
        })),
      };

    case "leads.list": {
      const q = str(payload.q).toLowerCase().trim();
      let items = [...s.leads];
      if (payload.type) items = items.filter((l) => l.type === payload.type);
      if (payload.stage) items = items.filter((l) => l.stage === payload.stage);
      if (payload.ownerId)
        items = items.filter((l) => l.owner_id === str(payload.ownerId));
      if (payload.source)
        items = items.filter((l) => l.source === str(payload.source));
      if (typeof payload.isStale === "boolean")
        items = items.filter((l) => l.is_stale === payload.isStale);
      if (q) {
        items = items.filter((l) =>
          [l.name, l.phone, l.phone_raw, l.address]
            .join(" ")
            .toLowerCase()
            .includes(q),
        );
      }
      items.sort((a, b) => b.updated_at.localeCompare(a.updated_at));

      const limit = num(payload.limit, 100) || 100;
      const page = num(payload.page, 1) || 1;
      return {
        items: items.slice((page - 1) * limit, page * limit),
        total: items.length,
        page,
        limit,
      };
    }

    case "leads.get": {
      const lead = requireLead(str(payload.id));
      return {
        lead,
        activities: s.activities
          .filter((a) => a.lead_id === lead.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      };
    }

    case "leads.create":
      return createLead(payload);

    case "leads.bulkCreate": {
      const items = Array.isArray(payload.items) ? payload.items : [];
      const leads: Lead[] = [];
      const duplicateLeads: Lead[] = [];
      let invalid = 0;
      for (const item of items) {
        try {
          const result = createLead(asRecord(item));
          if (result.duplicate) duplicateLeads.push(result.lead);
          else leads.push(result.lead);
        } catch {
          invalid += 1;
        }
      }
      return {
        created: leads.length,
        duplicates: duplicateLeads.length,
        invalid,
        leads,
        duplicateLeads,
      };
    }

    case "leads.update": {
      const lead = requireLead(str(payload.id));
      const patch = asRecord(payload.patch);
      const allowed = [
        "name",
        "phone",
        "address",
        "source",
        "notes",
        "order_count",
        "type",
        "last_activity_at",
        "is_stale",
      ];
      for (const key of Object.keys(patch)) {
        if (!allowed.includes(key)) {
          throw new MockError(
            "VALIDATION_ERROR",
            `Field "${key}" tidak boleh diubah`,
          );
        }
      }
      if (typeof patch.name === "string") lead.name = patch.name;
      if (typeof patch.phone === "string") {
        lead.phone_raw = patch.phone;
        lead.phone = normalizePhone(patch.phone);
      }
      if (typeof patch.address === "string") lead.address = patch.address;
      if (typeof patch.source === "string") lead.source = patch.source;
      if (typeof patch.notes === "string") lead.notes = patch.notes;
      if (patch.order_count !== undefined)
        lead.order_count = num(patch.order_count);
      if (patch.type === "B2B" || patch.type === "B2C") lead.type = patch.type;
      if (typeof patch.is_stale === "boolean") lead.is_stale = patch.is_stale;
      lead.updated_at = new Date().toISOString();

      const activity = addActivity(
        lead.id,
        "note",
        `Data lead diperbarui: ${Object.keys(patch).join(", ")}`,
        "system",
      );
      return { lead, activity };
    }

    case "leads.move": {
      const lead = requireLead(str(payload.id));
      const stage = str(payload.stage);
      if (!(stage in STAGE_LABELS)) {
        throw new MockError(
          "VALIDATION_ERROR",
          `Stage "${stage}" tidak dikenal`,
        );
      }
      const from = STAGE_LABELS[lead.stage];
      lead.stage = stage as Stage;
      touch(lead);
      const note = str(payload.note);
      const activity = addActivity(
        lead.id,
        "stage_change",
        `${from} -> ${STAGE_LABELS[lead.stage]}${note ? ` - ${note}` : ""}`,
        str(payload.actor, lead.owner_name),
      );
      return { lead, activity };
    }

    case "leads.assign": {
      const lead = requireLead(str(payload.id));
      const previous = lead.owner_name;
      const ownerId = str(payload.ownerId);
      const owner = ownerId
        ? s.sales.find((p) => p.id === ownerId)
        : autoAssign();
      if (ownerId && !owner) {
        throw new MockError("NOT_FOUND", `Sales ${ownerId} tidak ditemukan`);
      }
      lead.owner_id = owner?.id ?? "";
      lead.owner_name = owner?.name ?? "";
      touch(lead);
      recountSales();
      const activity = addActivity(
        lead.id,
        "assign",
        `Lead dipegang ${lead.owner_name || "tidak ada"}${
          previous ? `, sebelumnya ${previous}` : ""
        }`,
        "system",
      );
      return {
        lead,
        assignment: {
          ownerId: lead.owner_id,
          ownerName: lead.owner_name,
          rule: ownerId ? "manual" : owner ? "auto_round_robin" : "no_match",
        },
        activity,
      };
    }

    case "leads.delete": {
      const lead = requireLead(str(payload.id));
      s.leads.splice(s.leads.indexOf(lead), 1);
      s.archived.push(lead);
      touch(lead);
      recountSales();
      const activity = addActivity(
        lead.id,
        "note",
        "Lead dihapus (diarsipkan)",
        "system",
      );
      return { lead, activity };
    }

    case "leads.restore": {
      const id = str(payload.id);
      const lead = s.archived.find((l) => l.id === id);
      if (!lead) {
        throw new MockError(
          "VALIDATION_ERROR",
          `Lead ${id} tidak sedang dihapus`,
        );
      }
      s.archived.splice(s.archived.indexOf(lead), 1);
      s.leads.push(lead);
      touch(lead);
      recountSales();
      const activity = addActivity(
        lead.id,
        "note",
        "Lead dipulihkan dari arsip",
        "system",
      );
      return { lead, activity };
    }

    case "activities.create": {
      const lead = requireLead(str(payload.leadId));
      const content = str(payload.content).trim();
      if (!content) {
        throw new MockError("VALIDATION_ERROR", "content wajib diisi");
      }
      const activity = addActivity(
        lead.id,
        str(payload.type, "note") as ActivityType,
        content,
        str(payload.actor, lead.owner_name),
      );
      touch(lead, activity.created_at);
      return { activity, lead };
    }

    case "sales.list":
      return { sales: s.sales };

    case "sales.upsert": {
      const id = str(payload.id);
      const name = str(payload.name).trim();
      if (!name) throw new MockError("VALIDATION_ERROR", "name wajib diisi");
      const existing = id ? s.sales.find((p) => p.id === id) : undefined;
      if (existing) {
        existing.name = name;
        existing.phone = str(payload.phone, existing.phone);
        existing.active = payload.active !== false;
        return { sales: existing };
      }
      const created: Sales = {
        id: String(s.nextSalesId++),
        name,
        phone: str(payload.phone),
        active: payload.active !== false,
        lead_count: 0,
      };
      s.sales.push(created);
      return { sales: created };
    }

    case "stats.summary": {
      const byStage: Record<string, number> = {};
      const byType: Record<string, number> = {};
      const bySource: Record<string, number> = {};
      for (const lead of s.leads) {
        byStage[lead.stage] = (byStage[lead.stage] ?? 0) + 1;
        byType[lead.type] = (byType[lead.type] ?? 0) + 1;
        bySource[lead.source] = (bySource[lead.source] ?? 0) + 1;
      }
      return {
        total: s.leads.length,
        byStage,
        byType,
        bySource,
        byOwner: s.sales.map((p) => ({
          ownerId: p.id,
          ownerName: p.name,
          total: s.leads.filter((l) => l.owner_id === p.id).length,
          won: s.leads.filter((l) => l.owner_id === p.id && l.stage === "won")
            .length,
        })),
        staleCount: s.leads.filter((l) => l.is_stale).length,
        unassignedCount: s.leads.filter((l) => !l.owner_id).length,
      };
    }

    default:
      // Di mode live action ini dilayani gateway n8n terpisah, tapi di sini
      // keduanya tetap satu dispatcher supaya fallback berlaku untuk semua.
      if (action.startsWith("ai.")) return handleAiAction(action, payload);
      throw new MockError("UNKNOWN_ACTION", `Action "${action}" tidak dikenal`);
  }
}

/* ── Agen AI ───────────────────────────────────────────────────────────────
   Tujuh action ini dilayani `CRM AI Gateway` di mode live. Aturannya diimpor
   dari `lib/ai-rules.ts`, modul yang sama yang disalin ke Code node n8n, jadi
   yang berbeda antara dua mode hanya tempat datanya disimpan.

   Setiap efek tulis memanggil `handleMockAction` secara rekursif, bukan
   menyalin logikanya. Itu satu-satunya cara memastikan "Setujui" di tab agen
   berperilaku persis seperti tombol manual yang sudah ada.               */

function nowIso(): string {
  return new Date().toISOString();
}

function runId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Stopwatch untuk `steps[]`. Durasinya diukur, bukan dikarang — kalau nanti
    ditunjukkan bersama log eksekusi n8n, angkanya tidak boleh saling
    membantah. Jeda yang terlihat di layar dibuat di komponen, bukan di sini. */
function stepper() {
  let last = Date.now();
  const steps: AgentStep[] = [];
  return {
    steps,
    mark(key: string, label: string, detail: string, count: number | null) {
      const now = Date.now();
      steps.push({ key, label, detail, count, ms: now - last });
      last = now;
    },
  };
}

function aiTaskById(id: string): AiTask {
  const found = store().aiTasks.find((t) => t.id === id);
  if (!found) throw new MockError("NOT_FOUND", `Tugas ${id} tidak ditemukan`);
  return found;
}

function insertAiTask(
  task: Omit<AiTask, "id" | "createdAt">,
  at = nowIso(),
): AiTask {
  const s = store();
  const row: AiTask = { ...task, id: String(s.nextAiTaskId++), createdAt: at };
  s.aiTasks.push(row);
  return row;
}

function pendingWithKey(key: string): AiTask | undefined {
  return store().aiTasks.find(
    (t) => t.dedupeKey === key && t.status === "pending",
  );
}

/** Isi activity untuk follow-up yang disetujui. Sengaja menyebut bahwa
    teksnya draf agen dan siapa yang menyetujui — timeline lead harus bisa
    membedakan pesan yang ditulis sales sendiri dari yang disetujui. */
function followupActivityContent(text: string, actor: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const prefix = `Follow-up WA (draft agen AI, disetujui ${actor}): `;
  const room = 400 - prefix.length;
  return prefix + (flat.length > room ? `${flat.slice(0, room - 1)}…` : flat);
}

function requireGoal(value: unknown, fallback: FollowupGoal): FollowupGoal {
  const raw = str(value);
  if (!raw) return fallback;
  if (!(raw in GOAL_LABELS)) {
    throw new MockError(
      "VALIDATION_ERROR",
      `Goal "${raw}" tidak dikenal. Pilihan: ${Object.keys(GOAL_LABELS).join(", ")}`,
    );
  }
  return raw as FollowupGoal;
}

function waUrlFor(lead: Lead, text: string): string {
  if (normalizePhone(lead.phone).length < 9) {
    throw new MockError(
      "VALIDATION_ERROR",
      "Nomor WhatsApp lead tidak valid, draf tidak bisa dikirim",
    );
  }
  return waLink(lead.phone, text);
}

function tally<T extends string>(values: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function handleAiAction(
  action: string,
  payload: Record<string, unknown>,
): unknown {
  const s = store();

  switch (action) {
    case "ai.bootstrap": {
      const poolCounts = tally(s.prospects.map((p) => p.status));
      const taskCounts = tally(s.aiTasks.map((t) => t.status));
      return {
        areas: Object.entries(AREA_LABELS).map(([key, label]) => ({
          key,
          label,
          count: s.prospects.filter((p) => p.area === key).length,
        })),
        categories: Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
          key,
          label,
          count: s.prospects.filter((p) => p.category === key).length,
        })),
        goals: Object.entries(GOAL_LABELS).map(([key, label]) => ({
          key,
          label,
        })),
        taskKinds: Object.entries(TASK_KIND_LABELS).map(([key, label]) => ({
          key,
          label,
        })),
        templates: Object.entries(TEMPLATE_IDS).map(([goal, id]) => ({
          id,
          goal,
          label: GOAL_LABELS[goal as FollowupGoal],
        })),
        pool: { total: s.prospects.length, ...poolCounts },
        tasks: { total: s.aiTasks.length, ...taskCounts },
        scoring: { weights: SCORE_WEIGHTS, tiers: SCORE_TIERS },
      };
    }

    case "ai.prospect.search": {
      const clock = stepper();
      const query = str(payload.query).trim();
      const area = str(payload.area);
      const category = str(payload.category);
      const includeUsed = payload.includeUsed === true;
      const minScore = num(payload.minScore);
      const limit = Math.min(24, Math.max(1, num(payload.limit) || 12));

      if (area && !(area in AREA_LABELS)) {
        throw new MockError(
          "VALIDATION_ERROR",
          `Area "${area}" tidak dikenal. Pilihan: ${Object.keys(AREA_LABELS).join(", ")}`,
        );
      }
      if (category && !(category in CATEGORY_LABELS)) {
        throw new MockError(
          "VALIDATION_ERROR",
          `Kategori "${category}" tidak dikenal. Pilihan: ${Object.keys(CATEGORY_LABELS).join(", ")}`,
        );
      }

      const tokens = query ? query.split(/\s+/).filter(Boolean) : [];
      clock.mark(
        "parse",
        "Membaca permintaan",
        [
          tokens.length
            ? `kata kunci: ${tokens.join(", ")}`
            : "tanpa kata kunci",
          area ? `area ${AREA_LABELS[area as keyof typeof AREA_LABELS]}` : null,
          category
            ? `kategori ${CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        null,
      );

      clock.mark(
        "pool",
        "Membuka pool prospek",
        `${s.prospects.length} baris di crm_prospects`,
        s.prospects.length,
      );

      const rows = s.prospects.filter((p) => {
        if (area && p.area !== area) return false;
        if (category && p.category !== category) return false;
        if (!includeUsed && p.status === "converted") return false;
        return true;
      });
      clock.mark(
        "filter",
        "Menyaring area & kategori",
        `${rows.length} kandidat lolos filter`,
        rows.length,
      );

      const matched = rows.map((row) => ({
        row,
        ...matchProspect(row, query),
      }));
      const hits = tokens.length
        ? matched.filter((m) => m.matchScore > 0).length
        : rows.length;
      clock.mark(
        "match",
        "Mencocokkan kata kunci",
        tokens.length
          ? `${hits} kandidat cocok dengan "${query}"`
          : "tidak ada kata kunci, semua kandidat dipertahankan",
        hits,
      );

      const existingByPhone = new Map(s.leads.map((l) => [l.phone, l]));
      const alreadyInCrm = matched.filter((m) =>
        existingByPhone.has(m.row.phone),
      ).length;
      clock.mark(
        "dedupe",
        "Mencocokkan dengan CRM",
        alreadyInCrm
          ? `${alreadyInCrm} nomor sudah terdaftar`
          : "tidak ada nomor yang bentrok",
        alreadyInCrm,
      );

      const now = Date.now();
      let candidates: ProspectCandidate[] = matched.map((m) =>
        toCandidate(m.row, {
          now,
          existingLeadId: existingByPhone.get(m.row.phone)?.id ?? "",
          matchScore: m.matchScore,
          matchedOn: m.matchedOn,
        }),
      );
      if (minScore > 0) {
        candidates = candidates.filter((c) => c.score >= minScore);
      }
      const avg = candidates.length
        ? Math.round(
            candidates.reduce((sum, c) => sum + c.score, 0) / candidates.length,
          )
        : 0;
      clock.mark(
        "score",
        "Menilai kualitas listing",
        candidates.length ? `skor rata-rata ${avg}` : "tidak ada yang dinilai",
        candidates.length,
      );

      candidates.sort(
        (a, b) =>
          b.matchScore - a.matchScore ||
          b.score - a.score ||
          b.reviewCount - a.reviewCount ||
          a.name.localeCompare(b.name),
      );
      const total = candidates.length;
      const top = candidates.slice(0, limit);
      clock.mark(
        "rank",
        "Mengurutkan hasil",
        `${top.length} teratas ditampilkan`,
        top.length,
      );

      const sources = Object.entries(tally(top.map((c) => c.sourceLabel))).map(
        ([label, count]) => ({ label, count }),
      );

      return {
        runId: runId("run"),
        query,
        filters: { area, category, minScore },
        total,
        returned: top.length,
        tookMs: clock.steps.reduce((sum, step) => sum + step.ms, 0),
        sources,
        steps: clock.steps,
        candidates: top,
      };
    }

    case "ai.draft.followup": {
      const lead = requireLead(str(payload.leadId));
      const goal = requireGoal(payload.goal, pickGoal(lead));
      const draft = renderDraft(lead, goal);
      return {
        lead,
        draft: { ...draft, waUrl: waUrlFor(lead, draft.text) },
        alternatives: Object.entries(GOAL_LABELS)
          .filter(([key]) => key !== goal)
          .map(([key, label]) => ({ goal: key, goalLabel: label })),
      };
    }

    case "ai.tasks.list": {
      const status = str(payload.status);
      const kind = str(payload.kind);
      const leadId = str(payload.leadId);
      const limit = Math.max(1, num(payload.limit) || 50);

      const items = s.aiTasks
        .filter((t) => !status || t.status === status)
        .filter((t) => !kind || t.kind === kind)
        .filter((t) => !leadId || t.leadId === leadId)
        .sort(
          (a, b) =>
            b.priority - a.priority ||
            Date.parse(b.createdAt) - Date.parse(a.createdAt),
        )
        .slice(0, limit);

      return {
        items,
        total: items.length,
        counts: tally(s.aiTasks.map((t) => t.status)),
      };
    }

    case "ai.tasks.generate": {
      const kinds = Array.isArray(payload.kinds)
        ? (payload.kinds.map(String) as AiTaskKind[])
        : undefined;
      for (const kind of kinds ?? []) {
        if (!(kind in TASK_KIND_LABELS)) {
          throw new MockError(
            "VALIDATION_ERROR",
            `Jenis tugas "${kind}" tidak dikenal`,
          );
        }
      }

      const run = runId("gen");
      const planned = generateTasks({
        leads: s.leads,
        activities: s.activities,
        prospects: s.prospects,
        existingTasks: s.aiTasks.map((t) => ({
          dedupe_key: t.dedupeKey,
          status: t.status,
          decided_at: t.decidedAt,
        })),
        kinds,
      });

      const items = planned.tasks.map((task) =>
        insertAiTask({
          kind: task.kind,
          status: "pending",
          title: task.title,
          reason: task.reason,
          priority: task.priority,
          leadId: task.leadId,
          leadName: task.leadName,
          payload: task.payload,
          result: null,
          dedupeKey: task.dedupeKey,
          runId: run,
          actor: "",
          decidedAt: "",
          executedAt: "",
        }),
      );

      return {
        runId: run,
        scanned: {
          leads: s.leads.length,
          activities: s.activities.length,
          prospects: s.prospects.length,
          pendingTasks: s.aiTasks.filter((t) => t.status === "pending").length,
        },
        created: items.length,
        skipped: planned.skipped.length,
        items,
        skippedReasons: planned.skipped,
      };
    }

    case "ai.tasks.create": {
      const kind = str(payload.kind) as AiTaskKind;
      if (!(kind in TASK_KIND_LABELS)) {
        throw new MockError(
          "VALIDATION_ERROR",
          `Jenis tugas "${kind}" tidak dikenal`,
        );
      }
      const actor = str(payload.actor, "Operator");
      const run = runId("man");

      if (kind === "prospect_batch") {
        const ids = Array.isArray(payload.prospectIds)
          ? payload.prospectIds.map(String)
          : [];
        if (!ids.length) {
          throw new MockError(
            "VALIDATION_ERROR",
            "prospectIds tidak boleh kosong",
          );
        }
        const rows = ids.map((id) => {
          const row = s.prospects.find((p) => p.id === id);
          if (!row) {
            throw new MockError("NOT_FOUND", `Prospek ${id} tidak ditemukan`);
          }
          return row;
        });

        const key = dedupeKeyFor("prospect_batch", { prospectIds: ids });
        const existing = pendingWithKey(key);
        if (existing) return { task: existing, duplicate: true };

        const scores = rows.map((r) => scoreProspect(r).score);
        const avg = Math.round(
          scores.reduce((a, b) => a + b, 0) / scores.length,
        );
        return {
          task: insertAiTask({
            kind,
            status: "pending",
            title: `Tambahkan ${rows.length} prospek pilihan ke CRM`,
            reason: `Dipilih manual dari hasil pencarian, skor rata-rata ${avg}/100 — menunggu persetujuan sebelum ditulis ke crm_leads`,
            priority: avg,
            leadId: "",
            leadName: "",
            payload: {
              prospectIds: ids,
              source: "manual",
              areaMix: [...new Set(rows.map((r) => r.area))],
            },
            result: null,
            dedupeKey: key,
            runId: run,
            actor,
            decidedAt: "",
            executedAt: "",
          }),
          duplicate: false,
        };
      }

      const lead = requireLead(str(payload.leadId));

      if (kind === "followup") {
        const goal = requireGoal(payload.goal, pickGoal(lead));
        const draft = renderDraft(lead, goal);
        const text = str(payload.text).trim() || draft.text;
        const key = dedupeKeyFor("followup", { leadId: lead.id });
        const existing = pendingWithKey(key);
        if (existing) return { task: existing, duplicate: true };

        return {
          task: insertAiTask({
            kind,
            status: "pending",
            title: `Follow up ${lead.name}`,
            reason: draft.reason,
            priority: 60,
            leadId: lead.id,
            leadName: lead.name,
            payload: {
              leadId: lead.id,
              goal,
              templateId: draft.templateId,
              text,
              channel: "wa",
              vars: draft.vars,
            },
            result: null,
            dedupeKey: key,
            runId: run,
            actor,
            decidedAt: "",
            executedAt: "",
          }),
          duplicate: false,
        };
      }

      const stage = str(payload.stage);
      if (!(stage in STAGE_LABELS)) {
        throw new MockError(
          "VALIDATION_ERROR",
          `Stage "${stage}" tidak dikenal`,
        );
      }
      const key = dedupeKeyFor("stage_move", { leadId: lead.id, stage });
      const existing = pendingWithKey(key);
      if (existing) return { task: existing, duplicate: true };

      return {
        task: insertAiTask({
          kind,
          status: "pending",
          title: `Pindahkan ${lead.name} ke ${STAGE_LABELS[stage as Stage]}`,
          reason: `Diusulkan manual dari ${STAGE_LABELS[lead.stage]} ke ${STAGE_LABELS[stage as Stage]}`,
          priority: 60,
          leadId: lead.id,
          leadName: lead.name,
          payload: {
            leadId: lead.id,
            from: lead.stage,
            to: stage,
            note: str(payload.note, "Dipindahkan atas usulan agen"),
          },
          result: null,
          dedupeKey: key,
          runId: run,
          actor,
          decidedAt: "",
          executedAt: "",
        }),
        duplicate: false,
      };
    }

    case "ai.tasks.decide": {
      const task = aiTaskById(str(payload.id));
      const decision = str(payload.decision);
      if (decision !== "approve" && decision !== "reject") {
        throw new MockError(
          "VALIDATION_ERROR",
          'decision harus "approve" atau "reject"',
        );
      }
      if (task.status !== "pending") {
        throw new MockError("VALIDATION_ERROR", "Tugas sudah diputuskan");
      }

      const actor = str(payload.actor, "Operator");
      const overrides = asRecord(payload.overrides);
      task.actor = actor;
      task.decidedAt = nowIso();

      if (decision === "reject") {
        task.status = "rejected";
        task.result = { kind: task.kind, rejected: true };
        return { task, result: task.result };
      }

      // Efek yang gagal tidak dibalas sebagai error HTTP: barisnya sendiri
      // yang menjadi catatan kegagalan, supaya antrian di layar langsung
      // menunjukkan apa yang terjadi tanpa perlu ambil ulang.
      try {
        task.result = runTaskEffect(task, overrides, actor);
        task.status = "approved";
        task.executedAt = nowIso();
      } catch (error) {
        task.status = "failed";
        task.result = {
          kind: task.kind,
          error: {
            code: error instanceof MockError ? error.code : "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }

      return { task, result: task.result };
    }

    default:
      throw new MockError("UNKNOWN_ACTION", `Action "${action}" tidak dikenal`);
  }
}

function runTaskEffect(
  task: AiTask,
  overrides: Record<string, unknown>,
  actor: string,
): Record<string, unknown> {
  const s = store();
  const data = task.payload as Record<string, unknown>;

  if (task.kind === "followup") {
    const text = (str(overrides.text) || str(data.text)).trim();
    if (!text) {
      throw new MockError("VALIDATION_ERROR", "Teks pesan tidak boleh kosong");
    }
    const lead = requireLead(str(data.leadId));
    const result = handleMockAction("activities.create", {
      leadId: lead.id,
      type: "wa",
      content: followupActivityContent(text, actor),
      actor,
    }) as { activity: Activity; lead: Lead };

    return {
      kind: "followup",
      activity: result.activity,
      lead: result.lead,
      waUrl: waUrlFor(result.lead, text),
      text,
    };
  }

  if (task.kind === "stage_move") {
    const to = str(overrides.stage) || str(data.to);
    const result = handleMockAction("leads.move", {
      id: str(data.leadId),
      stage: to,
      note: str(data.note, "Dipindahkan atas usulan agen"),
      actor,
    }) as { lead: Lead; activity: Activity };

    return {
      kind: "stage_move",
      lead: result.lead,
      activity: result.activity,
      from: str(data.from),
      to,
    };
  }

  const ids = Array.isArray(overrides.prospectIds)
    ? overrides.prospectIds.map(String)
    : Array.isArray(data.prospectIds)
      ? (data.prospectIds as unknown[]).map(String)
      : [];

  const leads: Lead[] = [];
  const duplicateLeads: Lead[] = [];
  const invalidItems: { name: string; phone_raw: string; reason: string }[] =
    [];
  const categorizations: { leadId: string; type: string; reason: string }[] =
    [];
  const assignments: {
    leadId: string;
    ownerId: string;
    ownerName: string;
    rule: string;
  }[] = [];
  const converted: string[] = [];

  for (const id of ids) {
    const row = s.prospects.find((p) => p.id === id);
    if (!row) {
      invalidItems.push({
        name: "",
        phone_raw: "",
        reason: `Prospek ${id} tidak ditemukan`,
      });
      continue;
    }

    try {
      // Lewat `leads.create`, bukan penulisan langsung: dedupe nomor,
      // kategorisasi, dan round-robin harus berasal dari jalur yang sama
      // dengan tombol "Tambah lead" biasa.
      const created = handleMockAction(
        "leads.create",
        toCandidate(row, { existingLeadId: "" }).leadDraft,
      ) as {
        lead: Lead;
        duplicate: boolean;
        categorization?: { type: string; reason: string };
        assignment?: { ownerId: string; ownerName: string; rule: string };
      };

      if (created.duplicate) {
        duplicateLeads.push(created.lead);
        continue;
      }

      leads.push(created.lead);
      converted.push(row.id);
      row.status = "converted";
      row.convertedLeadId = created.lead.id;

      if (created.categorization) {
        categorizations.push({
          leadId: created.lead.id,
          type: created.categorization.type,
          reason: created.categorization.reason,
        });
      }
      if (created.assignment) {
        assignments.push({ leadId: created.lead.id, ...created.assignment });
      }
    } catch (error) {
      invalidItems.push({
        name: row.name,
        phone_raw: row.phoneRaw,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!leads.length && !duplicateLeads.length) {
    throw new MockError(
      "VALIDATION_ERROR",
      "Tidak ada prospek yang bisa dimasukkan",
    );
  }

  return {
    kind: "prospect_batch",
    created: leads.length,
    duplicates: duplicateLeads.length,
    invalid: invalidItems.length,
    invalidItems,
    leads,
    duplicateLeads,
    categorizations,
    assignments,
    prospectIds: ids,
    convertedProspects: converted.length,
  };
}
