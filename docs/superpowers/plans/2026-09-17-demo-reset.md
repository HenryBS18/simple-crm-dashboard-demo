# Tombol Reset Demo + Pencabutan Mock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satu tombol di dashboard yang mengembalikan seluruh data demo ke kondisi awal yang segar, dengan seed yang hidup di n8n, sekaligus mencabut seluruh data contoh dari frontend.

**Architecture:** Workflow n8n keempat (`CRM Demo Reset`) dengan webhook sendiri memegang satu-satunya jalur destruktif. Seed hidup di tiga data table n8n yang menyimpan relasi per indeks dan waktu sebagai offset menit, jadi tiap reset menghasilkan timeline segar. Dashboard memanggilnya lewat prefiks action `demo.` yang dirutekan `lib/n8n.ts` ke URL ketiga.

**Tech Stack:** Next.js 15 App Router, React Query, zod, Tailwind, shadcn/ui, n8n Workflow SDK, n8n Data Table.

**Spec:** `docs/superpowers/specs/2026-09-17-demo-reset-design.md`

## Global Constraints

- **SDK n8n adalah DSL deklaratif.** Deklarasi `function`, arrow function, `.map()`, `.reduce()`, dan `.filter()` di level kode SDK semuanya ditolak parser. Semua node dan schema ditulis literal. Ini tidak berlaku di dalam string `jsCode` — di sana JavaScript biasa.
- **Node pembaca dataTable wajib `executeOnce: true`** kalau dirantai setelah node lain yang mengeluarkan banyak item. Tanpa ini hasilnya berlipat (bug terbukti di AI Gateway: 24 prospek terbaca 8712).
- **`expr()` memakai kutip tunggal/ganda, bukan backtick.**
- **Deploy workflow selalu dari berkas di repo**, dengan `projectId: jybGqjoYSN755zQt` **dan** `folderId: Yek3LEEHwKm9Dyv9`. MCP n8n tidak punya operasi pindah folder.
- **`crm_config` (`GlW1ROM8sSfdO7LA`) tidak boleh disentuh operasi apa pun.** Isinya `api_key` yang dipakai ketiga gateway.
- **Bahasa UI dan komentar: Indonesia**, mengikuti seluruh repo.
- **Format: `npx biome format --write <file>`** setelah menyunting; `npx biome check` harus bersih.
- ID data table n8n auto-increment dan tidak pernah kembali ke 1.

## Catatan tentang pengujian — baca sebelum mulai

**Repo ini tidak punya test runner.** Tidak ada vitest, jest, atau playwright; `package.json` hanya punya `dev`, `build`, `start`, `lint`, `format`, dan tidak ada satu pun berkas `*.test.*`. Rencana ini karena itu **tidak memakai siklus TDD merah-hijau**, dan itu penyimpangan sadar dari default skill.

Alasannya: bagian paling berisiko dari pekerjaan ini — remap indeks→ID, offset waktu, urutan hapus-lalu-sisip — hidup di dalam Code node n8n, yang tidak bisa diimpor atau dipanggil dari repo. Satu-satunya cara mengujinya adalah mengeksekusinya.

Sebagai gantinya **tiap langkah verifikasi di bawah menyebut perintah persis dan keluaran yang diharapkan**, dan diperlakukan sama mengikatnya dengan test: kalau keluarannya tidak cocok, jangan lanjut ke langkah berikutnya.

Kalau Anda ingin test runner sungguhan ditambahkan, itu permintaan terpisah — katakan sebelum eksekusi dimulai.

**Properti yang membuat ini aman:** begitu Task 1 selesai, tabel seed terisi, sehingga menjalankan reset menjadi operasi yang bisa diulang tanpa kehilangan apa pun. Urutan task sengaja menaruh pengisian seed paling depan.

---

## Penyimpangan dari spec — perlu keputusan sebelum Task 1

Spec menetapkan **empat** tabel seed termasuk `crm_seed_prospects`, dengan reset menghapus lalu menyisipkan ulang 24 baris prospek.

Rencana ini memakai **tiga** tabel seed dan memperlakukan prospek berbeda: reset **meng-update prospek di tempat** kembali ke `status: 'new'`, `converted_lead_id: ''`, `converted_at: ''` — tanpa hapus, tanpa sisip, tanpa tabel seed.

Alasannya: demo tidak pernah menyunting atau menghapus baris prospek, hanya menandainya `converted`. Update di tempat menghilangkan satu tabel seed, menghilangkan risiko kehilangan 24 baris kalau eksekusi mati di tengah, dan menghilangkan kebutuhan menyalin 21 kolom lewat API yang bentuknya sudah dipetakan (`ai.prospect.search` mengembalikan bentuk kandidat, bukan baris mentah, jadi `last_seen_days` harus dihitung ulang dari `lastSeenAt` — lossy tanpa alasan).

Yang hilang: kalau seseorang menghapus baris `crm_prospects` secara manual, reset tidak bisa mengembalikannya.

**Kalau penyimpangan ini ditolak, hanya Task 1 dan Task 2 yang berubah.**

---

## Struktur berkas

| Berkas | Tanggung jawab |
|---|---|
| `n8n/demo-reset.workflow.js` | **Baru.** Sumber kebenaran workflow `CRM Demo Reset`. |
| `n8n/seed-capture.mjs` | **Baru.** Skrip sekali-pakai: baca keadaan live, buang jejak uji, ubah jadi bentuk seed, tulis JSON. |
| `n8n/API.md` | Dokumentasi action `demo.reset` dan tabel seed. |
| `lib/schema.ts` | Kontrak `demo.reset`; menampung tiga tipe yang pindah dari `ai-rules`. |
| `lib/crm.ts` | `resetDemo()`; pencabutan `crmSourceStore`. |
| `lib/queries.ts` | `useResetDemo()`; pencabutan `useCrmSource`. |
| `lib/n8n.ts` | Cabang prefiks `demo.`; pencabutan `demoModeForced()`. |
| `app/api/crm/route.ts` | Pencabutan fallback mock; 503 jujur. |
| `components/shell/reset-dialog.tsx` | **Baru.** Dialog konfirmasi ketik-ulang. |
| `components/shell/topbar.tsx` | Tombol reset; pencabutan `DemoBadge`. |
| `components/shell/workspace.tsx` | Pencabutan pemakaian `useCrmSource`. |
| `lib/mock.ts`, `lib/ai-rules.ts` | **Dihapus.** |

---

## Task 1: Tabel seed di n8n, terisi dari keadaan live yang sudah dibersihkan

Sasaran: tiga data table seed ada dan berisi 10 lead, 4 sales, 26 activity — baris asli sebelum agen AI pernah dipakai.

**Files:**
- Create: `n8n/seed-capture.mjs`
- n8n (bukan repo): data table `crm_seed_sales`, `crm_seed_leads`, `crm_seed_activities`

**Interfaces:**
- Produces: tiga data table beserta ID-nya, dipakai Task 2. Kolomnya persis seperti di Step 1.

- [ ] **Step 1: Buat tiga data table lewat MCP**

Panggil `mcp__n8n__create_data_table` tiga kali dengan `projectId: "jybGqjoYSN755zQt"`.

`crm_seed_sales`:
```
seed_index (number), name (string), phone (string), active (boolean)
```

`crm_seed_leads`:
```
seed_index (number), name (string), type (string), phone (string),
phone_raw (string), address (string), source (string), stage (string),
owner_index (number), order_count (number), value_estimate (number),
notes (string), classify_reason (string), is_stale (boolean),
created_minutes_ago (number), last_activity_minutes_ago (number)
```

`crm_seed_activities`:
```
lead_index (number), type (string), content (string), actor (string),
created_minutes_ago (number)
```

Catat ketiga ID yang dikembalikan; Task 2 membutuhkannya.

- [ ] **Step 2: Tulis skrip penangkap seed**

Buat `n8n/seed-capture.mjs`. Skrip ini dijalankan sekali, hasilnya JSON yang disisipkan lewat MCP di Step 4.

```js
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
```

- [ ] **Step 3: Jalankan skrip dan periksa jumlahnya**

Dev server harus hidup di port 3000.

Run:
```bash
node n8n/seed-capture.mjs > /tmp/seed.json
```

Expected di stderr: `sales=4 leads=10 activities=26`

Kalau `leads` bukan 10 atau `activities` bukan 26, **berhenti** — artinya keadaan live berbeda dari asumsi dan daftar jejak uji di skrip perlu ditinjau ulang sebelum apa pun disisipkan.

Periksa juga tidak ada `owner_index: 0` atau `lead_index: 0` (nol berarti relasi gagal dipetakan):
```bash
grep -c '"owner_index": 0' /tmp/seed.json; grep -c '"lead_index": 0' /tmp/seed.json
```
Expected: `0` dan `0`.

- [ ] **Step 4: Sisipkan ke tabel seed**

Panggil `mcp__n8n__add_data_table_rows` tiga kali, `projectId: "jybGqjoYSN755zQt"`, memakai ID tabel dari Step 1 dan isi array dari `/tmp/seed.json`. Urutan bebas — tabel seed tidak saling merujuk lewat ID.

- [ ] **Step 5: Verifikasi tabel seed terisi**

Run: `mcp__n8n__search_data_tables` dengan `query: "crm_seed"`.

Expected: tiga tabel muncul dengan kolom sesuai Step 1.

Jumlah barisnya diverifikasi di Task 2 Step 13, saat workflow membacanya — MCP tidak punya tool baca baris.

- [ ] **Step 6: Commit**

```bash
git add n8n/seed-capture.mjs
git commit -m "chore: skrip penangkap seed demo dari keadaan live"
```

---

## Task 2: Workflow `CRM Demo Reset`

Sasaran: webhook yang menghapus data demo dan menyisipkan ulang dari tabel seed, dengan penjaga konfirmasi dan penjaga seed-kosong.

**Files:**
- Create: `n8n/demo-reset.workflow.js`
- n8n: workflow `CRM Demo Reset`

**Interfaces:**
- Consumes: tiga ID tabel seed dari Task 1.
- Produces: webhook `POST /webhook/simple-crm-demo-reset`, action `demo.reset`, payload `{ confirm: "RESET" }`, balasan `{ ok, data: { seededAt, deleted: {leads,activities,sales,prospects,aiTasks}, inserted: {leads,activities,sales,prospects} }, meta }`. Dipakai Task 3.

- [ ] **Step 1: Tulis kerangka workflow**

Buat `n8n/demo-reset.workflow.js`. Salin **persis** pola auth dan envelope dari `n8n/ai-gateway.workflow.js` — node `Load Config` → auth → `Request Valid?`, dan `Format Response` → `Respond to Dashboard` di ujung.

**Nama node auth harus `Auth & Parse Reset`.** Langkah-langkah berikutnya merujuknya lewat `$('Auth & Parse Reset')`, dan `Format Response` hasil salinan masih menunjuk `$('Auth & Parse AI')` — baris itu wajib diganti. Kalau terlewat, `requestId` diam-diam berubah jadi id eksekusi dan tidak ada yang error.

Di dalam node auth, ganti juga `$('AI Webhook')` menjadi `$('Reset Webhook')`.

Konstanta di kepala berkas:
```js
const T_LEADS = "048bYoe3wwNXPwmS";
const T_ACTIVITIES = "hoviNVBkQPJcv3yi";
const T_SALES = "sIZNvfyMzaUA9VFD";
const T_PROSPECTS = "Bt4eJ0TOkiIhH8c9";
const T_TASKS = "yf9VcYN1Ym5bV9BL";
const T_CONFIG = "GlW1ROM8sSfdO7LA";
// diisi dari Task 1 Step 1:
const T_SEED_SALES = "<id dari Task 1>";
const T_SEED_LEADS = "<id dari Task 1>";
const T_SEED_ACTIVITIES = "<id dari Task 1>";
```

Trigger:
```js
const webhookTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.1,
  config: {
    name: "Reset Webhook",
    parameters: {
      httpMethod: "POST",
      path: "simple-crm-demo-reset",
      responseMode: "responseNode",
      options: { allowedOrigins: "*" },
    },
  },
});
```

Di `Auth & Parse`, `ACTIONS` berisi satu entri: `['demo.reset']`.

- [ ] **Step 2: Tambah tiga node pembaca seed**

Ketiganya literal, `executeOnce: true`, `alwaysOutputData: true`. Contoh satu:

```js
const loadSeedSales = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Load Seed Sales",
    parameters: {
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: T_SEED_SALES },
      returnAll: true,
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});
```

Ulangi persis untuk `Load Seed Leads` (`T_SEED_LEADS`) dan `Load Seed Activities` (`T_SEED_ACTIVITIES`). Jangan dibuat lewat fungsi pabrik — SDK menolaknya.

- [ ] **Step 3: Tambah node `Plan Reset` — penjaga dan perencana**

Node Code yang berjalan setelah ketiga pembaca. Ini yang menegakkan konfirmasi dan menolak seed kosong **sebelum** ada penghapusan.

```js
const planReset = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Plan Reset",
    parameters: {
      jsCode: `
var payload = $('Auth & Parse Reset').first().json.payload || {};
if (String(payload.confirm) !== 'RESET') {
  return [{ json: { error: { code: 'VALIDATION_ERROR', message: 'confirm harus bernilai "RESET"' } } }];
}

function rowsOf(name) {
  return $(name).all().map(function (i) { return i.json; })
    .filter(function (r) { return r && r.id !== undefined; });
}

var seedSales = rowsOf('Load Seed Sales');
var seedLeads = rowsOf('Load Seed Leads');
var seedActivities = rowsOf('Load Seed Activities');

// Menghapus tanpa seed berarti demo kosong permanen. Tolak lebih dulu.
if (!seedSales.length || !seedLeads.length) {
  return [{ json: { error: { code: 'VALIDATION_ERROR', message: 'Tabel seed kosong — reset dibatalkan sebelum menghapus apa pun' } } }];
}

seedSales.sort(function (a, b) { return Number(a.seed_index) - Number(b.seed_index); });
seedLeads.sort(function (a, b) { return Number(a.seed_index) - Number(b.seed_index); });

var now = Date.now();
var iso = function (minutesAgo) {
  return new Date(now - Number(minutesAgo || 0) * 60000).toISOString();
};

return [{ json: {
  __ok: true,
  nowIso: new Date(now).toISOString(),
  sales: seedSales.map(function (s) {
    return { seed_index: Number(s.seed_index), name: s.name || '', phone: s.phone || '', active: s.active === true, lead_count: 0 };
  }),
  leads: seedLeads.map(function (l) {
    return {
      seed_index: Number(l.seed_index), owner_index: Number(l.owner_index || 0),
      name: l.name || '', type: l.type || '', phone: l.phone || '', phone_raw: l.phone_raw || '',
      address: l.address || '', source: l.source || '', stage: l.stage || 'todo',
      order_count: Number(l.order_count || 0), value_estimate: Number(l.value_estimate || 0),
      notes: l.notes || '', classify_reason: l.classify_reason || '', is_stale: l.is_stale === true,
      created_at: iso(l.created_minutes_ago), updated_at: iso(l.created_minutes_ago),
      last_activity_at: iso(l.last_activity_minutes_ago), deleted_at: ''
    };
  }),
  activities: seedActivities.map(function (a) {
    return {
      lead_index: Number(a.lead_index || 0), type: a.type || 'note',
      content: a.content || '', actor: a.actor || '', created_at: iso(a.created_minutes_ago)
    };
  })
} }];
`,
    },
  },
});
```

Lalu `ifElse` bernama `Reset Valid?` yang bercabang pada `{{ $json.__ok }}`, persis seperti `Decide Valid?` di AI Gateway. Cabang false langsung ke `Format Response`.

- [ ] **Step 4: Tambah lima node penghapus**

Semuanya `deleteRows` dengan filter yang mencocokkan semua baris. `filters.conditions` wajib minimal satu entri. Contoh satu:

```js
const deleteLeads = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Delete Leads",
    parameters: {
      resource: "row",
      operation: "deleteRows",
      dataTableId: { __rl: true, mode: "id", value: T_LEADS },
      matchType: "allConditions",
      filters: {
        conditions: [{ keyName: "id", condition: "gte", keyValue: "1" }],
      },
      options: {},
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});
```

Ulangi literal untuk `Delete Activities` (`T_ACTIVITIES`), `Delete Sales` (`T_SALES`), `Delete AI Tasks` (`T_TASKS`).

**`crm_prospects` tidak dihapus** — lihat bagian penyimpangan di atas. Sebagai gantinya satu node update:

```js
const resetProspects = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Reset Prospects",
    parameters: {
      resource: "row",
      operation: "update",
      dataTableId: { __rl: true, mode: "id", value: T_PROSPECTS },
      matchType: "allConditions",
      filters: {
        conditions: [{ keyName: "id", condition: "gte", keyValue: "1" }],
      },
      columns: {
        mappingMode: "defineBelow",
        value: {
          status: "new",
          converted_lead_id: "",
          converted_at: "",
        },
        schema: [
          { id: "status", displayName: "status", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "converted_lead_id", displayName: "converted_lead_id", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "converted_at", displayName: "converted_at", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
        ],
      },
      options: {},
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});
```

**Jangan pernah menambahkan node yang menyentuh `T_CONFIG`.**

- [ ] **Step 5: Tambah rantai sisip**

Urutannya mengikat: sales dulu (lead butuh `owner_id`), lalu lead (activity butuh `lead_id`), lalu activity.

Tiga node Code pembentang item (`Emit Seed Sales`, `Emit Seed Leads`, `Emit Seed Activities`) dan tiga node insert. Pembentang sales:

```js
jsCode: `return $('Plan Reset').first().json.sales.map(function (s) { return { json: s }; });`
```

Node `Insert Sales`:

```js
const insertSales = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Insert Sales",
    parameters: {
      resource: "row",
      operation: "insert",
      dataTableId: { __rl: true, mode: "id", value: T_SALES },
      columns: {
        mappingMode: "defineBelow",
        value: {
          name: expr("{{ $json.name }}"),
          phone: expr("{{ $json.phone }}"),
          active: expr("{{ $json.active }}"),
          lead_count: expr("{{ $json.lead_count }}"),
        },
        schema: [
          { id: "name", displayName: "name", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "phone", displayName: "phone", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "active", displayName: "active", required: false, defaultMatch: false, display: true, type: "boolean", canBeUsedToMatch: true },
          { id: "lead_count", displayName: "lead_count", required: false, defaultMatch: false, display: true, type: "number", canBeUsedToMatch: true },
        ],
      },
      options: {},
    },
    alwaysOutputData: true,
  },
});
```

`Insert Leads` dan `Insert Activities` mengikuti bentuk yang sama terhadap `T_LEADS` dan `T_ACTIVITIES`, dengan `value` dan `schema` literal untuk tiap kolom yang dihasilkan pembentangnya. Kolom `crm_leads`: `name`, `type`, `phone`, `phone_raw`, `address`, `source`, `stage`, `owner_id`, `owner_name`, `order_count` (number), `value_estimate` (number), `notes`, `classify_reason`, `is_stale` (boolean), `last_activity_at`, `created_at`, `updated_at`, `deleted_at`. Kolom `crm_activities`: `lead_id`, `type`, `content`, `actor`, `created_at` — semuanya string.

Pembentang lead harus memetakan `owner_index` ke ID sales yang baru tersisip. Node insert mengembalikan `{id, createdAt, updatedAt}` berurutan, jadi pasangkan berdasarkan posisi — trik yang sama dipakai `Shape Task Insert` di AI Gateway:

```js
jsCode: `
var plan = $('Plan Reset').first().json;
var inserted = $('Insert Sales').all().map(function (i) { return i.json; })
  .filter(function (r) { return r && r.id !== undefined; });
var idByIndex = {};
var nameByIndex = {};
for (var i = 0; i < plan.sales.length; i++) {
  if (inserted[i]) {
    idByIndex[plan.sales[i].seed_index] = String(inserted[i].id);
    nameByIndex[plan.sales[i].seed_index] = plan.sales[i].name;
  }
}
return plan.leads.map(function (l) {
  var copy = Object.assign({}, l);
  copy.owner_id = idByIndex[l.owner_index] || '';
  copy.owner_name = nameByIndex[l.owner_index] || '';
  delete copy.seed_index;
  delete copy.owner_index;
  return { json: copy };
});
`
```

Pembentang activity memetakan `lead_index` dengan cara yang sama terhadap `$('Insert Leads')`, menghasilkan `lead_id`, lalu membuang `lead_index`.

- [ ] **Step 6: Tambah `Count Lead Per Sales` dan update balik `crm_sales`**

Setelah lead tersisip, hitung `lead_count` tiap sales dan update barisnya.

```js
const countLeadPerSales = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Count Lead Per Sales",
    parameters: {
      jsCode: `
var plan = $('Plan Reset').first().json;
var insertedSales = $('Insert Sales').all().map(function (i) { return i.json; })
  .filter(function (r) { return r && r.id !== undefined; });
var emittedLeads = $('Emit Seed Leads').all().map(function (i) { return i.json; });

var tally = {};
for (var i = 0; i < emittedLeads.length; i++) {
  var oid = String(emittedLeads[i].owner_id || '');
  if (oid) tally[oid] = (tally[oid] || 0) + 1;
}

return insertedSales.map(function (row) {
  return { json: { id: Number(row.id), lead_count: tally[String(row.id)] || 0 } };
});
`,
    },
  },
});

const updateSalesCount = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Update Sales Count",
    parameters: {
      resource: "row",
      operation: "update",
      dataTableId: { __rl: true, mode: "id", value: T_SALES },
      matchType: "allConditions",
      filters: {
        conditions: [{ keyName: "id", condition: "eq", keyValue: expr("{{ $json.id }}") }],
      },
      columns: {
        mappingMode: "defineBelow",
        value: { lead_count: expr("{{ $json.lead_count }}") },
        schema: [
          { id: "lead_count", displayName: "lead_count", required: false, defaultMatch: false, display: true, type: "number", canBeUsedToMatch: true },
        ],
      },
      options: {},
    },
    alwaysOutputData: true,
  },
});
```

`Count Lead Per Sales` membaca `Emit Seed Leads` — bukan `Plan Reset` — karena `owner_id` hasil pemetaan baru ada setelah pembentang berjalan.

- [ ] **Step 7: Tambah `Shape Reset Result`**

```js
jsCode: `
function countOf(name) {
  try {
    return $(name).all().map(function (i) { return i.json; })
      .filter(function (r) { return r && r.id !== undefined; }).length;
  } catch (e) { return 0; }
}
var plan = $('Plan Reset').first().json;
return [{ json: { data: {
  seededAt: plan.nowIso,
  deleted: {
    leads: countOf('Delete Leads'), activities: countOf('Delete Activities'),
    sales: countOf('Delete Sales'), prospects: 0, aiTasks: countOf('Delete AI Tasks')
  },
  inserted: {
    leads: countOf('Insert Leads'), activities: countOf('Insert Activities'),
    sales: countOf('Insert Sales'), prospects: countOf('Reset Prospects')
  }
} } }];
`
```

`deleted.prospects` selalu 0 karena prospek di-update, bukan dihapus; jumlah yang dikembalikan ke `new` muncul di `inserted.prospects`.

- [ ] **Step 8: Rangkai grafnya**

Tanpa langkah ini berkasnya hanya kumpulan node tanpa workflow. Urutannya mengikat: validasi sebelum penghapusan, sales sebelum lead, lead sebelum activity.

```js
export default workflow("crm-demo-reset", "CRM Demo Reset")
  .add(webhookTrigger)
  .to(loadConfig)
  .to(authParse)
  .to(
    requestValid
      .onTrue(
        loadSeedSales.to(
          loadSeedLeads.to(
            loadSeedActivities.to(
              planReset.to(
                resetValid
                  .onTrue(
                    deleteLeads.to(
                      deleteActivities.to(
                        deleteSales.to(
                          deleteTasks.to(
                            resetProspects.to(
                              emitSeedSales.to(
                                insertSales.to(
                                  emitSeedLeads.to(
                                    insertLeads.to(
                                      emitSeedActivities.to(
                                        insertActivities.to(
                                          countLeadPerSales.to(
                                            updateSalesCount.to(
                                              shapeResetResult,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  )
                  .onFalse(formatResponse),
              ),
            ),
          ),
        ),
      )
      .onFalse(formatResponse),
  )
  .add(shapeResetResult)
  .to(formatResponse)
  .add(formatResponse)
  .to(respond)
  .add(noteWrites);
```

Tambahkan satu sticky `noteWrites` yang menerangkan batas tulis: workflow ini menghapus `crm_leads`, `crm_activities`, `crm_sales`, `crm_ai_tasks` dan mengembalikan `crm_prospects` ke `new`; `crm_config` tidak pernah disentuh.

Perhatikan `.onFalse(formatResponse)` muncul dua kali — cabang auth gagal dan cabang `Reset Valid?` gagal keduanya langsung ke pembentuk balasan, persis pola `Decide Valid?` di AI Gateway.

- [ ] **Step 9: Periksa sintaks dan larangan SDK secara lokal**

Run:
```bash
cd "D:/works/WithMi Automation/Demo Leads/simple-crm-dashboard-demo"
cp n8n/demo-reset.workflow.js /tmp/dr.mjs && node --check /tmp/dr.mjs && echo "SYNTAX OK"
node -e "
const s=require('fs').readFileSync('n8n/demo-reset.workflow.js','utf8');
const stripped=s.replace(/\`(?:\\\\.|[^\\\\\`])*\`/gs,'\"T\"');
for (const [k,re] of Object.entries({fn:/(^|[^.\w])function\s+\w*\s*\(/g, arrow:/=>/g, map:/\.map\(/g, reduce:/\.reduce\(/g, filter:/\.filter\(/g}))
  console.log(k, (stripped.match(re)||[]).length);
"
```
Expected: `SYNTAX OK`, lalu `fn 0`, `arrow 0`, `map 0`, `reduce 0`, `filter 0`.

- [ ] **Step 10: Deploy dan publish**

`mcp__n8n__create_workflow_from_code` dengan `projectId: "jybGqjoYSN755zQt"`, `folderId: "Yek3LEEHwKm9Dyv9"`, `name: "CRM Demo Reset"`, dan isi berkas. Lalu `mcp__n8n__publish_workflow`.

- [ ] **Step 11: Uji penjaga — konfirmasi salah**

```bash
KEY=$(grep '^N8N_CRM_API_KEY=' .env.local | cut -d= -f2)
curl -s -X POST https://n8n.withmiautomation.com/webhook/simple-crm-demo-reset \
  -H 'content-type: application/json' -H "x-api-key: $KEY" \
  -d '{"action":"demo.reset","payload":{"confirm":"ya"}}'
```
Expected: `{"ok":false,"error":{"code":"VALIDATION_ERROR",...}}`

Lalu buktikan tidak ada yang terhapus:
```bash
curl -s -X POST http://localhost:3000/api/crm -H 'content-type: application/json' \
  -d '{"action":"leads.list","payload":{}}' | grep -o '"id"' | wc -l
```
Expected: jumlah lead masih 18 (belum direset).

- [ ] **Step 12: Uji reset sungguhan**

```bash
curl -s -X POST https://n8n.withmiautomation.com/webhook/simple-crm-demo-reset \
  -H 'content-type: application/json' -H "x-api-key: $KEY" \
  -d '{"action":"demo.reset","payload":{"confirm":"RESET"}}'
```
Expected: `ok: true`, `inserted.leads` = 10, `inserted.sales` = 4, `inserted.activities` = 26, `inserted.prospects` = 24.

- [ ] **Step 13: Verifikasi hasilnya**

```bash
curl -s -X POST http://localhost:3000/api/crm -H 'content-type: application/json' \
  -d '{"action":"leads.list","payload":{}}'
```
Expected: 10 lead, tidak ada nama prospek canvassing (Glamping Kebun Teh Malabar dkk), Ova Villa kembali `stage: todo`, tiap lead punya `owner_name` terisi.

```bash
curl -s -X POST http://localhost:3000/api/crm -H 'content-type: application/json' \
  -d '{"action":"ai.bootstrap","payload":{}}'
```
Expected: `pool` = `{total: 24, new: 24}` tanpa `converted`, `tasks` = `{total: 0}`.

Periksa juga kesegaran: `leads.list` tidak boleh memuat `last_activity_at` yang lebih tua dari offset seed terbesar terhitung dari sekarang.

Verifikasi relasi activity — tiap activity harus menempel ke lead yang benar, bukan tergeser satu:

```bash
for id in $(curl -s -X POST http://localhost:3000/api/crm -H 'content-type: application/json' \
  -d '{"action":"leads.list","payload":{}}' | python -c "
import json,sys
d=json.load(sys.stdin)['data']; items=d['items'] if 'items' in d else d
print(' '.join(str(l['id']) for l in items))
"); do
  curl -s -X POST http://localhost:3000/api/crm -H 'content-type: application/json' \
    -d "{\"action\":\"leads.get\",\"payload\":{\"id\":\"$id\"}}" | python -c "
import json,sys
d=json.load(sys.stdin)['data']
print(d['lead']['name'], '->', len(d.get('activities',[])), 'activity')
"
done
```
Expected: total activity seluruh lead = 26, dan tidak ada lead dengan 0 activity (tiap lead seed minimal punya activity `created`).

Verifikasi `lead_count`:

```bash
curl -s -X POST http://localhost:3000/api/crm -H 'content-type: application/json' \
  -d '{"action":"sales.list","payload":{}}'
```
Expected: 4 sales, dan jumlah `lead_count` keseluruhan = 10, cocok dengan sebaran `owner_name` di `leads.list`.

- [ ] **Step 14: Uji idempotensi**

Jalankan Step 12 sekali lagi. Expected: angka yang sama persis. Lalu ulangi Step 13 — hasilnya harus identik kecuali ID baris naik.

- [ ] **Step 15: Dokumentasikan dan commit**

Tambahkan bagian `demo.reset` di `n8n/API.md`: URL webhook, payload, bentuk balasan, daftar tabel seed beserta ID-nya, dan catatan bahwa prospek di-update bukan dihapus.

```bash
git add n8n/demo-reset.workflow.js n8n/API.md
git commit -m "feat: workflow CRM Demo Reset"
```

---

## Task 3: Kontrak, klien, dan hook

Sasaran: `demo.reset` bisa dipanggil dari dashboard lewat `/api/crm`.

**Files:**
- Modify: `lib/n8n.ts:24-32`, `lib/schema.ts:525-567`, `lib/crm.ts`, `lib/queries.ts`, `.env.local`, `.env.example`

**Interfaces:**
- Consumes: webhook dari Task 2.
- Produces: `crm.resetDemo()` dan `useResetDemo()`, dipakai Task 4.

- [ ] **Step 1: Routing URL ketiga**

`lib/n8n.ts` — ganti kedua fungsi pemilih:

```ts
function urlFor(action: string): string | undefined {
  if (action.startsWith("ai.")) return process.env.N8N_CRM_AI_URL;
  if (action.startsWith("demo.")) return process.env.N8N_CRM_RESET_URL;
  return process.env.N8N_CRM_URL;
}

function urlNameFor(action: string): string {
  if (action.startsWith("ai.")) return "N8N_CRM_AI_URL";
  if (action.startsWith("demo.")) return "N8N_CRM_RESET_URL";
  return "N8N_CRM_URL";
}
```

- [ ] **Step 2: Isi env**

Tambahkan ke `.env.local` dan `.env.example` (di `.env.example` biarkan kosong):

```
# Endpoint webhook ketiga untuk action demo.* (CRM Demo Reset).
N8N_CRM_RESET_URL=https://n8n.withmiautomation.com/webhook/simple-crm-demo-reset
```

Restart `next dev` — env sisi server dibaca saat start.

- [ ] **Step 3: Kontrak action**

`lib/schema.ts`, sebelum `} as const;`:

```ts
const demoResetPayload = z.object({ confirm: z.literal("RESET") });

const demoResetCounts = z.object({
  leads: z.coerce.number().catch(0),
  activities: z.coerce.number().catch(0),
  sales: z.coerce.number().catch(0),
  prospects: z.coerce.number().catch(0),
  aiTasks: z.coerce.number().catch(0),
});

const demoResetData = z.object({
  seededAt: text,
  deleted: demoResetCounts,
  inserted: demoResetCounts.partial().catch({}),
});
```

Lalu entri di `ACTIONS`, dengan komentar yang menjelaskan prefiksnya:

```ts
  /* Action reset dilayani gateway n8n ketiga (`CRM Demo Reset`). Prefiks
     `demo.` yang dipakai `lib/n8n.ts` untuk memilih URL. */
  "demo.reset": { payload: demoResetPayload, data: demoResetData },
```

- [ ] **Step 4: Wrapper klien**

`lib/crm.ts`, setelah wrapper agen:

```ts
/* ── Reset demo ──────────────────────────────────────────────────────────── */

export const resetDemo = () => callCrm("demo.reset", { confirm: "RESET" });
```

- [ ] **Step 5: Hook**

`lib/queries.ts`:

```ts
export function useResetDemo() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => crm.resetDemo(),

    onSuccess: (data) => {
      // Reset menyentuh setiap tabel; tidak ada cache yang masih sahih.
      client.clear();
      const i = data.inserted ?? {};
      toast.success(
        `Data demo dikembalikan: ${i.leads ?? 0} lead, ${i.activities ?? 0} activity, ${i.sales ?? 0} sales.`,
      );
    },

    onError: (error) => {
      const message =
        error instanceof CrmError ? error.message : "Reset gagal dijalankan.";
      toast.error(message);
    },
  });
}
```

- [ ] **Step 6: Uji lewat proxy dashboard**

```bash
curl -s -D - -o /tmp/b -X POST http://localhost:3000/api/crm \
  -H 'content-type: application/json' \
  -d '{"action":"demo.reset","payload":{"confirm":"RESET"}}' | grep -i '^HTTP\|^x-crm'
cat /tmp/b
```
Expected: `HTTP/1.1 200`, `x-crm-source: n8n`, body `ok: true` dengan angka seperti Task 2 Step 12.

Lalu uji penolakan:
```bash
curl -s -X POST http://localhost:3000/api/crm -H 'content-type: application/json' \
  -d '{"action":"demo.reset","payload":{"confirm":"ya"}}'
```
Expected: `ok: false`, `VALIDATION_ERROR` — ditolak zod di `lib/schema.ts` sebelum menyentuh jaringan.

- [ ] **Step 7: Format, lint, commit**

```bash
npx biome format --write lib/n8n.ts lib/schema.ts lib/crm.ts lib/queries.ts
npx biome check lib
git add lib .env.example
git commit -m "feat: action demo.reset dan routing gateway ketiga"
```

`.env.local` tidak di-commit.

---

## Task 4: Tombol dan dialog konfirmasi

Sasaran: tombol reset di topbar dengan konfirmasi ketik-ulang.

**Files:**
- Create: `components/shell/reset-dialog.tsx`
- Modify: `components/shell/topbar.tsx`

**Interfaces:**
- Consumes: `useResetDemo()` dari Task 3.
- Produces: `<ResetDialog />`, dipasang di `Topbar`.

- [ ] **Step 1: Buat dialog**

`components/shell/reset-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLeads, useResetDemo } from "@/lib/queries";

const PHRASE = "RESET";

export function ResetDialog() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const reset = useResetDemo();
  const leads = useLeads();

  // Angka diambil dari cache papan, bukan request tambahan.
  const leadCount = leads.data?.total ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Reset demo
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kembalikan data demo ke awal?</DialogTitle>
          <DialogDescription>
            {leadCount} lead beserta seluruh activity, sales, dan antrian agen
            akan dihapus, lalu diganti data seed dari n8n. Tidak bisa dibatalkan.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="reset-confirm">
            Ketik <span className="font-mono font-medium">{PHRASE}</span> untuk
            melanjutkan
          </Label>
          <Input
            id="reset-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            variant="destructive"
            disabled={typed !== PHRASE || reset.isPending}
            onClick={() =>
              reset.mutate(undefined, { onSuccess: () => setOpen(false) })
            }
          >
            {reset.isPending ? "Mereset…" : "Reset sekarang"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Kalau `components/ui/button.tsx` tidak punya varian `destructive`, pakai `variant="outline"` dengan `className="text-signal"` — jangan menambah varian baru untuk satu tombol.

- [ ] **Step 2: Pasang di topbar**

`components/shell/topbar.tsx` — impor `ResetDialog`, lalu ubah blok kanan:

```tsx
        <div className="ml-auto flex items-center gap-2">
          {children}
          <ResetDialog />
        </div>
```

- [ ] **Step 3: Verifikasi build**

Run: `npx next build`
Expected: lolos tanpa error tipe.

- [ ] **Step 4: Verifikasi di browser**

Buka `http://localhost:3000`. Periksa berurutan:

1. Tombol "Reset demo" muncul di kanan topbar, di keempat tab
2. Klik → dialog terbuka, tombol "Reset sekarang" **mati**
3. Ketik `rese` → masih mati; ketik `RESET` → hidup
4. Klik → toast sukses menyebut jumlah, dialog tertutup
5. Papan, tabel, halaman sales, dan tab Agen AI semuanya menampilkan data seed **tanpa refresh manual**
6. Tutup dialog lalu buka lagi → kolom isian kosong, tombol mati lagi

- [ ] **Step 5: Format dan commit**

```bash
npx biome format --write components/shell/reset-dialog.tsx components/shell/topbar.tsx
npx biome check components
git add components/shell
git commit -m "feat: tombol reset demo dengan konfirmasi ketik ulang"
```

---

## Task 5: Pencabutan mock dari frontend

Sasaran: tidak ada data contoh di repo, dan n8n yang mati menghasilkan error jujur.

Dikerjakan terakhir dengan sengaja: sampai reset terbukti jalan, mock masih satu-satunya jaring pengaman.

**Files:**
- Delete: `lib/mock.ts`, `lib/ai-rules.ts`
- Modify: `lib/schema.ts`, `app/api/crm/route.ts`, `lib/n8n.ts`, `lib/crm.ts`, `lib/queries.ts`, `components/shell/topbar.tsx`, `components/shell/workspace.tsx`, `.env.example`, `.env.local`, `README.md`

- [ ] **Step 1: Pindahkan tiga tipe ke schema.ts**

`lib/schema.ts:2` mengimpor `AiTaskKind`, `AiTaskStatus`, `FollowupGoal` dari `@/lib/ai-rules` — satu-satunya yang masih dipakai. Buang baris impor itu, ganti dengan definisi lokal di dekat skema agen:

```ts
/* Dulu di lib/ai-rules.ts. Kernel aturannya kini hanya hidup di n8n; tiga
   tipe ini tetap dibutuhkan untuk mengunci literal di ACTIONS. */
export type AiTaskKind = "prospect_batch" | "followup" | "stage_move";
export type AiTaskStatus = "pending" | "approved" | "rejected" | "failed";
export type FollowupGoal =
  | "perkenalan"
  | "tindak_lanjut_penawaran"
  | "repeat_order"
  | "reaktivasi";
```

Cocokkan nilainya dengan `TASK_KIND_LABELS`, status di `n8n/API.md:523-526`, dan `GOAL_LABELS` sebelum menghapus `ai-rules.ts`.

- [ ] **Step 2: Hapus kedua berkas**

```bash
git rm lib/mock.ts lib/ai-rules.ts
```

- [ ] **Step 3: Sederhanakan route handler**

`app/api/crm/route.ts` — buang impor `lib/mock`, buang `serveFromMock` dan `CrmSource`, dan ganti ekor `POST`:

```ts
  const outcome = await callN8n(action, payload);
  if (outcome.kind === "ok") return reply(outcome.body);

  // Backend mati tidak boleh menyamar jadi data sungguhan. Lebih baik layar
  // error yang jujur daripada papan terisi yang diam-diam salah.
  return fail("BACKEND_UNAVAILABLE", outcome.detail, 503);
```

Buang juga cabang `demoModeForced()` di baris 114 dan impornya.

`reply()` dan `fail()` kehilangan parameter `source` dan kedua header penanda:

```ts
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
```

Semua pemanggil `fail()` di dalam `POST` ikut kehilangan argumen terakhirnya — empat pemanggil: body bukan JSON, body tidak sesuai bentuk, action tidak dikenal, dan cabang 503 yang baru.

- [ ] **Step 4: Buang `demoModeForced` dari lib/n8n.ts**

Hapus fungsinya seluruhnya. Tidak ada pemanggil lain setelah Step 3.

- [ ] **Step 5: Buang store sumber data**

`lib/crm.ts` — buang `CrmSource`, `currentSource`, `setSource`, `crmSourceStore`, dan blok pembaca header di dalam `callCrm` (baris 63-74). `callCrm` langsung lanjut ke `response.json()`.

`lib/queries.ts` — buang `useCrmSource` dan impor `crmSourceStore` serta `useSyncExternalStore`.

- [ ] **Step 6: Bersihkan komponen**

`components/shell/topbar.tsx` — buang `DemoBadge` beserta impor `useCrmSource`; `<DemoBadge />` di dalam header ikut hilang.

`components/shell/workspace.tsx:30` — buang pemakaian `useCrmSource` dan apa pun yang dirender darinya.

- [ ] **Step 7: Bersihkan env dan dokumentasi**

Buang `NEXT_PUBLIC_DEMO_MODE` dan `CRM_MOCK_FAIL` dari `.env.example` dan `.env.local`.

`README.md` — buang kedua baris itu dari tabel env (`README.md:31-33`), dan tulis ulang bagian "Mode demo" (`README.md:35-47`) menjadi penjelasan bahwa dashboard selalu memakai n8n, backend yang mati menghasilkan 503, dan data demo dikembalikan lewat tombol Reset.

- [ ] **Step 8: Verifikasi tidak ada sisa**

```bash
grep -rn "mock\|PROSPECT_SEED\|ai-rules\|DEMO_MODE\|x-crm-source" app lib components --include=*.ts --include=*.tsx
```
Expected: tidak ada keluaran.

```bash
npx biome check .
npx next build
```
Expected: keduanya bersih.

- [ ] **Step 9: Verifikasi 503 jujur**

Matikan dev server, jalankan ulang dengan URL dikosongkan:

```bash
N8N_CRM_URL= npx next dev -p 3001
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/crm \
  -H 'content-type: application/json' -d '{"action":"leads.list","payload":{}}'
```
Expected: `503` — bukan 200 dengan data contoh.

Buka `http://localhost:3001` dan pastikan layarnya menampilkan error, bukan papan terisi. Hentikan server port 3001 setelahnya.

- [ ] **Step 10: Commit**

```bash
git add -A lib app components README.md .env.example
git commit -m "refactor: cabut mock dan kernel aturan dari frontend"
```

---

## Verifikasi akhir

- [ ] `npx biome check .` bersih
- [ ] `npx next build` lolos
- [ ] Reset dari UI mengembalikan 10 lead, 4 sales, 26 activity, 24 prospek `new`, 0 tugas agen
- [ ] Reset dua kali berturut-turut menghasilkan angka identik
- [ ] `demo.reset` dengan `confirm` salah ditolak di kedua lapis: zod di klien dan Code node di n8n
- [ ] Tabel seed kosong → reset ditolak tanpa menghapus apa pun
- [ ] `N8N_CRM_URL` kosong → 503, bukan data contoh
- [ ] Papan kanban, tabel lead, halaman sales, dan tab Agen AI semuanya menampilkan data seed setelah reset tanpa refresh manual
- [ ] `grep -rn "mock" app lib components` kosong
- [ ] Workflow `CRM Demo Reset` berada di folder `Yek3LEEHwKm9Dyv9`
