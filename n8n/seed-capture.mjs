/* Sekali pakai: menangkap keadaan live jadi bentuk seed.

   Memakai ALLOWLIST, bukan daftar buang. Data live terus bertambah tiap kali
   dashboard dipakai demo, jadi daftar buang berbasis ID langsung basi; daftar
   simpan tidak. Yang disimpan adalah baris asli sebelum agen AI pernah dipakai:
   lead 1-10 dan sales 1-4.

   Semua lead id>=12 bersumber `canvassing` — tanda tangan approval prospek
   agen — dan sales 5 (`Yoga`, nonaktif, 0 lead) serta 6 (`budi`, nomor tidak
   ternormalisasi) muncul dari sesi demo. Tidak ada lead asli yang dimiliki
   kedua sales itu, jadi membuangnya tidak meninggalkan lead yatim.

   Activity milik lead yang tidak disimpan gugur dengan sendirinya karena
   activity hanya dikumpulkan dari lead yang disimpan. Yang perlu dibuang
   eksplisit hanya jejak agen pada lead yang DISIMPAN: activity 34 dan 43,
   keduanya di Ova Villa. */
const API = "http://localhost:3000/api/crm";

const KEEP_LEAD_IDS = new Set(["1","2","3","4","5","6","7","8","9","10"]);
const KEEP_SALES_IDS = new Set(["1","2","3","4"]);
const DROP_ACTIVITY_IDS = new Set(["34", "43"]);
/* Ova Villa dipindahkan agen saat uji coba; stage aslinya todo. */
const STAGE_OVERRIDE = { "1": "todo" };

async function call(action, payload = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`${action}: ${JSON.stringify(body.error)}`);
  return body.data;
}

const salesData = await call("sales.list");
/* Kontrak sales.list memakai kunci `sales` (lihat n8n/API.md), bukan `items`. */
const allSales = salesData.sales ?? salesData.items ?? salesData;
const salesRows = allSales.filter((s) => KEEP_SALES_IDS.has(String(s.id)));

const leadsData = await call("leads.list");
const allLeads = leadsData.items ?? leadsData;
const leads = allLeads.filter((l) => KEEP_LEAD_IDS.has(String(l.id)));

/* Activity diambil per lead; leads.list tidak membawanya. */
const activities = [];
for (const lead of leads) {
  const detail = await call("leads.get", { id: String(lead.id) });
  for (const a of detail.activities ?? []) {
    if (DROP_ACTIVITY_IDS.has(String(a.id))) continue;
    activities.push({ ...a, lead_id: String(lead.id) });
  }
}

/* Titik nol = activity paling baru yang tersisa. Semua offset dihitung mundur
   dari sana, jadi saat reset seluruh timeline berakhir "barusan". */
const times = activities.map((a) => Date.parse(a.created_at)).filter((t) => !Number.isNaN(t));
const zero = Math.max(...times);
const minutesAgo = (iso) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((zero - t) / 60000));
};

const salesIndexById = new Map();
const seedSales = salesRows.map((s, i) => {
  salesIndexById.set(String(s.id), i + 1);
  return {
    seed_index: i + 1,
    name: s.name ?? "",
    phone: s.phone ?? "",
    active: s.active === true,
  };
});

const leadIndexById = new Map();
const seedLeads = leads.map((l, i) => {
  leadIndexById.set(String(l.id), i + 1);
  /* last_activity_at Ova Villa disentuh uji coba; diturunkan ulang dari
     activity tersisa paling baru milik lead itu supaya timeline konsisten. */
  const own = activities
    .filter((a) => a.lead_id === String(l.id))
    .map((a) => Date.parse(a.created_at))
    .filter((t) => !Number.isNaN(t));
  const lastIso = own.length
    ? new Date(Math.max(...own)).toISOString()
    : l.last_activity_at || l.created_at;
  return {
    seed_index: i + 1,
    name: l.name ?? "",
    type: l.type ?? "",
    phone: l.phone ?? "",
    phone_raw: l.phone_raw ?? "",
    address: l.address ?? "",
    source: l.source ?? "",
    stage: STAGE_OVERRIDE[String(l.id)] ?? l.stage ?? "todo",
    owner_index: salesIndexById.get(String(l.owner_id)) ?? 0,
    order_count: Number(l.order_count ?? 0),
    value_estimate: Number(l.value_estimate ?? 0),
    notes: l.notes ?? "",
    classify_reason: l.classify_reason ?? "",
    is_stale: l.is_stale === true,
    created_minutes_ago: minutesAgo(l.created_at),
    last_activity_minutes_ago: minutesAgo(lastIso),
  };
});

const seedActivities = activities.map((a) => ({
  lead_index: leadIndexById.get(a.lead_id) ?? 0,
  type: a.type ?? "note",
  content: a.content ?? "",
  actor: a.actor ?? "",
  created_minutes_ago: minutesAgo(a.created_at),
}));

const out = { seedSales, seedLeads, seedActivities };
console.log(JSON.stringify(out, null, 2));
console.error(
  `sales=${seedSales.length} leads=${seedLeads.length} activities=${seedActivities.length}`,
);
