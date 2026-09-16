import { normalizePhone } from "@/lib/format";
import type {
  Activity,
  ActivityType,
  Lead,
  LeadType,
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
  };
}

const globalStore = globalThis as unknown as { __crmMock?: Store };
function store(): Store {
  globalStore.__crmMock ??= seed();
  // Store lama yang masih nyangkut di global setelah HMR belum punya `archived`.
  globalStore.__crmMock.archived ??= [];
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

/** Kategorisasi tiruan: kata kunci usaha di NAMA (bukan alamat) berarti B2B. */
const B2B_KEYWORDS = [
  "villa",
  "resort",
  "hotel",
  "cafe",
  "kopi",
  "roastery",
  "catering",
  "katering",
  "dapur",
  "resto",
  "cv",
  "pt",
  "toko",
  "grosir",
];

function classify(
  name: string,
  address: string,
  orderCount: number,
): { type: LeadType; reason: string } {
  const lower = name.toLowerCase();
  const hit = B2B_KEYWORDS.find((k) => lower.includes(k));
  if (hit) {
    return {
      type: "B2B",
      reason: `Nama mengandung kata "${hit}", dikategorikan B2B`,
    };
  }
  const addressHit = B2B_KEYWORDS.find((k) =>
    address.toLowerCase().includes(k),
  );
  if (addressHit) {
    return {
      type: "B2C",
      reason: `Kata "${addressHit}" hanya ada di alamat, bukan nama usaha, dikategorikan B2C`,
    };
  }
  return {
    type: "B2C",
    reason: `Pembelian atas nama pribadi, ${orderCount}x order, dikategorikan B2C`,
  };
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
      throw new MockError("UNKNOWN_ACTION", `Action "${action}" tidak dikenal`);
  }
}
