# CRM Backend API — referensi tim frontend

Semua contoh di bawah diambil dari eksekusi nyata pada 2026-09-16, bukan karangan.

## Endpoint

```
POST https://n8n.withmiautomation.com/webhook/simple-crm-demo-api
Content-Type: application/json
x-api-key: <API_KEY>
```

Test URL (hanya aktif saat tombol "Execute workflow" ditekan di editor n8n):
`https://n8n.withmiautomation.com/webhook-test/simple-crm-demo-api`

Body selalu `{ "action": "<nama.action>", "payload": { ... } }`.

API key disimpan di data table `crm_config` baris `api_key`. Kalau n8n Variable
`CRM_API_KEY` diisi, nilainya menang atas isi tabel.

## Envelope

Sukses (HTTP 200):

```json
{ "ok": true, "data": {}, "meta": { "requestId": "719137", "ts": "2026-09-16T04:56:05.924Z" } }
```

Gagal:

```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "..." }, "meta": { "requestId": "719105", "ts": "..." } }
```

| code | HTTP |
|---|---|
| `UNAUTHORIZED` | 401 |
| `UNKNOWN_ACTION` | 400 |
| `VALIDATION_ERROR` | 400 |
| `NOT_FOUND` | 404 |
| `INTERNAL_ERROR` | 500 |

## Bentuk objek

`Lead` memakai nama kolom apa adanya (snake_case) plus `id` bertipe string:

```json
{
  "id": "10", "name": "Bella", "type": "B2C",
  "phone": "6287722863562", "phone_raw": "0877-2286-3562",
  "address": "Villa Lembang", "source": "dm", "stage": "lost",
  "owner_id": "4", "owner_name": "Fajar", "order_count": 2, "notes": "",
  "classify_reason": "Kata \"villa\" hanya ada di alamat, sudah 2x order, dikategorikan B2C",
  "is_stale": false,
  "last_activity_at": "2026-09-16T04:52:34.091Z",
  "created_at": "2026-09-16T04:51:03.341Z",
  "updated_at": "2026-09-16T04:52:34.091Z"
}
```

`Activity`: `{ id, lead_id, type, content, actor, created_at }` — semuanya string.

## Action

### bootstrap

Request: `{"action":"bootstrap","payload":{}}`

```json
{"stages":[{"key":"todo","label":"To Do"},{"key":"in_progress","label":"In Progress"},{"key":"won","label":"Win"},{"key":"lost","label":"Fail"}],
 "sources":["meta_ads","dm","organic","komunitas","canvassing","referral","manual"],
 "types":["B2B","B2C"],
 "sales":[{"id":"1","name":"Rangga","active":true,"lead_count":3}]}
```

Kolom kanban dirender persis dari urutan `stages`.

### leads.list

Payload: `{ type?, stage?, ownerId?, source?, q?, isStale?, page=1, limit=100, sort="updated_at:desc" }`
`q` mencari di name, phone, phone_raw, dan address (case insensitive).

Response: `{ "items": Lead[], "total": 10, "page": 1, "limit": 100 }`

### leads.get

Payload `{ id }` → `{ lead: Lead, activities: Activity[] }`, activity terbaru dulu.

```json
{"lead":{"id":"1","name":"Ova Villa","...":"..."},
 "activities":[
  {"id":"19","lead_id":"1","type":"call","content":"Ditelpon, minta dikirim katalog lewat WhatsApp","actor":"Rangga","created_at":"2026-09-16T04:52:33.599Z"},
  {"id":"1","lead_id":"1","type":"created","content":"Lead masuk dari canvassing, dikategorikan B2B, di-assign ke Rangga","actor":"system","created_at":"2026-09-16T04:39:15.122Z"}]}
```

`id` tidak ketemu → 404 `NOT_FOUND`.

### leads.create

Payload `{ name, phone, address?, type?, source?, orderCount?, notes?, ownerId? }`

```json
{"lead":{"id":"11","name":"Uji Coba Villa","type":"B2B","owner_name":"Sinta","...":"..."},
 "duplicate":false,
 "categorization":{"type":"B2B","reason":"Nama mengandung kata \"villa\", dikategorikan B2B"},
 "assignment":{"ownerId":"2","ownerName":"Sinta","rule":"auto_round_robin"}}
```

Nomor sudah ada → tetap HTTP 200, tidak ada baris baru:

```json
{"duplicate":true,"lead":{"id":"11","...":"..."}}
```

Tanpa `name` atau `phone` → 400 `VALIDATION_ERROR` "name dan phone wajib diisi".

`rule` bisa `auto_round_robin`, `manual`, atau `no_match`.

Auto-assign memilih sales aktif dengan `lead_count` paling kecil, seri dipecah
alfabetis. **Segmen B2B/B2C tidak memengaruhi siapa ownernya** — kategorisasi tetap
dihitung dan disimpan di lead, tapi hanya untuk ditampilkan.

### leads.bulkCreate

Payload `{ items: [ {name, phone, ...} ] }` → `{ created, duplicates, leads, duplicateLeads, invalid }`.
Hasil seeding 10 lead sampel: `created 9, duplicates 1, invalid 0`.

### leads.update

Payload `{ id, patch }`. Field yang boleh: `name`, `phone`, `address`, `source`,
`notes`, `order_count`, `type`, `last_activity_at`, `is_stale`.
Field lain → 400 `VALIDATION_ERROR` `Field "stage" tidak boleh diubah`.
`updated_at` selalu ikut diperbarui, dan satu activity `note` dicatat.

Response: `{ lead: Lead, activity: Activity }`

### leads.move

Payload `{ id, stage, note?, actor? }`. Stage hanya `todo`, `in_progress`, `won`, `lost`.

```json
{"lead":{"id":"1","stage":"in_progress","is_stale":false,"...":"..."},
 "activity":{"type":"stage_change","content":"To Do -> In Progress - Sudah dihubungi ulang"}}
```

Stage di luar empat itu → 400 `VALIDATION_ERROR`. Move selalu mereset `is_stale` ke false
dan menyetel `last_activity_at` ke sekarang.

### leads.assign

Payload `{ id, ownerId? }`. Tanpa `ownerId` → auto-assign ke sales aktif dengan
beban paling ringan, tanpa memandang segmen lead.

```json
{"lead":{"id":"10","owner_id":"4","owner_name":"Fajar","...":"..."},
 "assignment":{"ownerId":"4","ownerName":"Fajar","rule":"manual"},
 "activity":{"id":"20","type":"assign","content":"Lead di-assign ke Fajar, sebelumnya Dewi"}}
```

`lead_count` owner lama turun dan owner baru naik.

### leads.delete

Payload `{ id, actor? }`. Soft delete: baris di `crm_leads` tidak dibuang, kolom
`deleted_at` diisi timestamp. `lead_count` owner-nya turun 1 dan satu activity
`note` "Lead dihapus (diarsipkan)" dicatat.

```json
{"lead":{"id":"11","name":"Henry Bintang Setiawan","...":"..."},
 "activity":{"type":"note","content":"Lead dihapus (diarsipkan)"}}
```

Setelah ini lead tidak muncul di `leads.list`, tidak dihitung `stats.summary`,
dan `leads.get` / `leads.move` / `leads.assign` / `leads.update` /
`activities.create` untuk id itu balas 404 `NOT_FOUND`. Menghapus lead yang sudah
terhapus → 400 `VALIDATION_ERROR` "Lead sudah dihapus".

`deleted_at` **tidak pernah ikut dikirim** di objek `Lead` — semua reader
menyaringnya di sisi n8n, jadi bentuk `Lead` di atas tetap berlaku apa adanya.

Nomor telepon lead yang terarsip juga dilepas dari pengecekan duplikat, jadi
`leads.create` dengan nomor yang sama membuat lead baru (`duplicate: false`),
bukan mengembalikan baris yang tak terlihat di mana pun.

### leads.restore

Payload `{ id, actor? }`. Kebalikannya: `deleted_at` dikosongkan, `lead_count`
owner naik 1, activity `note` "Lead dipulihkan dari arsip". Response sama
bentuknya dengan `leads.delete`.

Memulihkan lead yang tidak sedang terhapus → 400 `VALIDATION_ERROR`
"Lead tidak sedang dihapus". Id yang tidak ada → 404 `NOT_FOUND`.

### activities.create

Payload `{ leadId, type, content, actor? }`.
`type`: `note`, `call`, `wa`, `visit`, `stage_change`, `assign`, `created`.

```json
{"activity":{"id":"19","lead_id":"1","type":"call","content":"Ditelpon, minta dikirim katalog lewat WhatsApp","actor":"Rangga","created_at":"2026-09-16T04:52:33.599Z"},
 "lead":{"id":"1","is_stale":false,"last_activity_at":"2026-09-16T04:52:33.599Z","...":"..."}}
```

Selalu ikut memperbarui `last_activity_at` dan mereset `is_stale` di lead terkait.

### sales.list

`{ "sales": [ { "id","name","phone","active","lead_count" } ] }`

### sales.upsert

Payload `{ id?, name, phone?, active }`. Tanpa `id` berarti membuat sales baru.
Field `handles` sudah tidak ada lagi; kalau tetap dikirim, diabaikan diam-diam.

Response: `{ "sales": { "id":"5","name":"Yoga","phone":"6281200000005","active":false,"lead_count":0 } }`

### stats.summary

```json
{"total":10,
 "byStage":{"todo":4,"in_progress":3,"won":2,"lost":1},
 "byType":{"B2B":5,"B2C":5},
 "bySource":{"canvassing":2,"referral":1,"organic":3,"meta_ads":2,"dm":2},
 "byOwner":[{"ownerId":"1","ownerName":"Rangga","total":3,"won":0}],
 "staleCount":2,"unassignedCount":0}
```

## Endpoint kedua (untuk demo, bukan dipakai dashboard)

```
POST https://n8n.withmiautomation.com/webhook/simple-crm-intake-demo-api
Body: { "items": [ { "name": "...", "phone": "..." } ] }
```

Tanpa API key. Memakai pipeline intake yang sama, membalas
`{ leads, created, duplicates, duplicateLeads, invalid, assignments, categorizations }`.

## Sumber daya n8n

| Apa | ID |
|---|---|
| Project | `jybGqjoYSN755zQt` (Demo Prototype) |
| Folder | `Yek3LEEHwKm9Dyv9` (Simple CRM Dashboard Demo - Henry) |
| Workflow CRM API Gateway | `tcHXd9QlPQTJiZTa` |
| Workflow CRM Lead Intake | `kEy4STOjkUNhQTGv` |
| Workflow CRM Stale Detector | `mLLbQrkqTnLKQadS` |
| Data table crm_leads | `048bYoe3wwNXPwmS` (punya kolom `deleted_at` untuk arsip) |
| Data table crm_sales | `sIZNvfyMzaUA9VFD` |
| Data table crm_activities | `hoviNVBkQPJcv3yi` |
| Data table crm_config | `GlW1ROM8sSfdO7LA` |

## 4 lead cadangan (sengaja belum di-seed)

Dipakai untuk demo input manual di depan klien:

```json
[
 { "name": "Jack Villa Lembang dan Dago", "phone": "0815-1374-5378", "address": "Pengelola Villa Lembang & Dago Area", "source": "komunitas" },
 { "name": "ApVoucher Villa", "phone": "0821-8888-7245", "address": "Pengelola Villa Lembang & Dago Area", "source": "komunitas" },
 { "name": "Disella", "phone": "0821-1111-9124", "address": "Permata Kopo 1 Blok H no 50", "orderCount": 6, "source": "referral" },
 { "name": "Shauma", "phone": "0881-0221-32633", "address": "Pasir Salam, Regol", "orderCount": 1, "source": "meta_ads" }
]
```

---

# CRM AI Gateway — endpoint kedua

> **Status: sudah di-deploy dan aktif.** Workflow `CRM AI Gateway`
> (`FF6HJ35DQY08mQ4O`, 37 node) berjalan di project Demo Prototype dari sumber
> [`n8n/ai-gateway.workflow.js`](ai-gateway.workflow.js). Ketujuh action `ai.*`
> dilayani n8n selama `N8N_CRM_AI_URL` terisi di `.env.local`; kalau kosong
> atau webhook-nya mati, action `ai.*` jatuh ke `lib/mock.ts` — itu perilaku
> yang memang dirancang, bukan kegagalan.
>
> Dua hal yang baru ketahuan saat deploy, keduanya sudah diperbaiki di sumber:
>
> 1. **SDK n8n adalah DSL deklaratif.** Deklarasi `function` *dan* arrow
>    function ditolak parser, jadi `.map()`/`.reduce()` pembangun schema ikut
>    ditolak. Semua pabrik node dan schema kini ditulis literal.
> 2. **Node dataTable berjalan sekali per item masuk.** Karena keempat pembaca
>    dirantai seri, tanpa `executeOnce: true` tiap tabel terbaca berulang —
>    10 lead x 33 activity x 24 prospek menghasilkan 8712 baris prospek palsu,
>    dedupe nomor melar, dan satu request makan 45 detik. Dengan `executeOnce`
>    angkanya kembali 24 dan request selesai di bawah satu detik.
>
> Contoh respons di bawah **diambil dari eksekusi `lib/mock.ts`**, bukan dari
> n8n. Keduanya memakai kernel aturan yang sama (`lib/ai-rules.ts`), jadi
> bentuknya identik — tapi ini perlu disebut supaya janji "semua contoh dari
> eksekusi nyata" di atas tidak jadi bohong.

## Kenapa gateway terpisah

`CRM API Gateway` berukuran ~100 ribu karakter JSON dan menopang seluruh papan.
Menambah cabang ke dalamnya lewat API berarti menulis ulang seluruh workflow
untuk perubahan yang sifatnya menambah saja — kalau gagal, ke-13 action lama
ikut mati. Karena itu action agen dilayani workflow kedua dengan webhook
sendiri:

```
POST https://n8n.withmiautomation.com/webhook/simple-crm-demo-ai
Content-Type: application/json
x-api-key: <API_KEY>
```

Kunci API, envelope, dan kode `Auth & Parse` / `Format Response`-nya **salinan
persis** milik gateway lama. Satu kunci, dua URL. Dashboard memilih URL dari
prefiks action di `lib/n8n.ts`: action berawalan `ai.` ke `N8N_CRM_AI_URL`,
sisanya ke `N8N_CRM_URL`.

Konsekuensi yang memang diinginkan: kalau `N8N_CRM_AI_URL` kosong atau
workflow-nya mati, **hanya tab Agen AI** yang jatuh ke data contoh. Papan
kanban tetap live.

## Batas tulis

AI Gateway memiliki `crm_prospects` dan `crm_ai_tasks`. Untuk menyentuh lead:

| Efek | Caranya |
|---|---|
| Membuat lead | `executeWorkflow` ke `CRM Lead Intake` (`kEy4STOjkUNhQTGv`) — dedup nomor, kategorisasi B2B/B2C, dan round-robin sudah matang di sana |
| Mencatat activity | Insert langsung ke `crm_activities` |
| Memindahkan stage | Update `crm_leads`, **hanya** kolom `stage`, `last_activity_at`, `is_stale`, `updated_at` |

Tidak ada HTTP self-call ke gateway lama: `CRM Lead Intake` bertrigger
`executeWorkflowTrigger` dengan `inputSource: 'passthrough'`, jadi bisa
dipanggil langsung. Satu eksekusi, bukan dua.

## Sumber lead prospek adalah `canvassing`

Node `Plan Intake` punya `VALID_SOURCES` dan **menulis ulang sumber tak dikenal
menjadi `manual` tanpa error**. Jadi sumber karangan seperti `ai_prospect` akan
hilang diam-diam. Prospek memakai `canvassing`, dan jejak asal-usulnya ditaruh
di `notes`:

```
Prospek dari agen AI — Direktori Villa Bandung Raya, rating 4,7 (186 ulasan), 14 unit sewa, skor 91/100.
```

## Konvensi nomor telepon kolam prospek

24 baris memakai `0800-1000-0001` … `0800-1000-0024` → `6280010000001` dst.

Nomor seluler Indonesia ada di `0811`–`0859` dan `0877`–`0899`; mengarang di
sana berisiko mengenai orang sungguhan. **`0800` adalah rentang bebas-pulsa
yang tidak pernah menjadi nomor seluler**, jadi `wa.me/6280010000012` dijamin
menjawab "nomor tidak terdaftar di WhatsApp". Aman meskipun barisnya benar-benar
masuk ke `crm_leads` dan tombol WhatsApp-nya diklik di depan klien. Blok ini
berurutan dan monoton, jadi sekilas lihat pun ketahuan ini data contoh.

## Tidak ada LLM

Skoring, pemilihan template, dan heuristik usulan semuanya deterministik.
Kernelnya ada di `lib/ai-rules.ts` dan disalin ke tiap Code node. Titik tukar
ke LLM asli nanti cuma satu node — kontrak action di bawah tidak perlu berubah.

## Ringkasan action

| Action | Payload | Data |
|---|---|---|
| `ai.bootstrap` | `{}` | `{ areas[], categories[], goals[], taskKinds[], templates[], pool, tasks, scoring }` |
| `ai.prospect.search` | `{ query?, area?, category?, limit?=12, includeUsed?=false, minScore?=0 }` | `{ runId, query, filters, total, returned, tookMs, sources[], steps[], candidates[] }` |
| `ai.draft.followup` | `{ leadId, goal? }` | `{ lead, draft, alternatives[] }` |
| `ai.tasks.list` | `{ status?, kind?, leadId?, limit?=50 }` | `{ items[], total, counts }` |
| `ai.tasks.generate` | `{ kinds? }` | `{ runId, scanned, created, skipped, items[], skippedReasons[] }` |
| `ai.tasks.create` | `{ kind, leadId?, prospectIds?, goal?, text?, stage?, note?, actor? }` | `{ task, duplicate }` |
| `ai.tasks.decide` | `{ id, decision, actor?, overrides? }` | `{ task, result }` |

### `ai.prospect.search`

`steps[]` adalah tahap kerja beserta durasinya yang **diukur**, bukan dikarang —
kalau log eksekusi n8n ikut ditunjukkan ke klien, angka di layar dan di log
harus bercerita sama. Jeda antar langkah yang terlihat di UI dibuat di
komponen, bukan di backend.

```json
{
 "runId": "run_12345",
 "query": "gathering rombongan",
 "filters": { "area": "lembang", "category": "", "minScore": 0 },
 "total": 6, "returned": 6, "tookMs": 3,
 "sources": [{ "label": "Direktori Villa Bandung Raya", "count": 2 }],
 "steps": [
  { "key": "parse", "label": "Membaca permintaan", "detail": "kata kunci: gathering, rombongan · area Lembang", "count": null, "ms": 0 },
  { "key": "pool", "label": "Membuka pool prospek", "detail": "24 baris di crm_prospects", "count": 24, "ms": 1 },
  { "key": "filter", "label": "Menyaring area & kategori", "detail": "6 kandidat lolos filter", "count": 6, "ms": 0 },
  { "key": "match", "label": "Mencocokkan kata kunci", "detail": "1 kandidat cocok dengan \"gathering rombongan\"", "count": 1, "ms": 1 },
  { "key": "dedupe", "label": "Mencocokkan dengan CRM", "detail": "tidak ada nomor yang bentrok", "count": 0, "ms": 1 },
  { "key": "score", "label": "Menilai kualitas listing", "detail": "skor rata-rata 75", "count": 6, "ms": 0 },
  { "key": "rank", "label": "Mengurutkan hasil", "detail": "6 teratas ditampilkan", "count": 6, "ms": 0 }
 ],
 "candidates": [ /* lihat bawah */ ]
}
```

Satu kandidat:

```json
{
 "prospectId": "1",
 "name": "Villa Kayu Lembang",
 "category": "villa", "categoryLabel": "Villa",
 "area": "lembang", "areaLabel": "Lembang",
 "address": "Jl. Kolonel Masturi No. 112, Cisarua, Lembang",
 "phone": "6280010000001", "phoneRaw": "0800-1000-0001",
 "rating": 4.7, "reviewCount": 186, "unitCount": 14, "unitLabel": "14 unit sewa",
 "priceBand": "premium", "priceNote": "Rp1,2jt–2,4jt / malam",
 "sourceLabel": "Direktori Villa Bandung Raya",
 "listingUrl": "https://direktori-villa-bandung-raya.example/l/1-villa-kayu-lembang",
 "hasWhatsapp": true, "verified": true,
 "lastSeenAt": "2026-09-12T12:41:18.000Z", "lastSeenLabel": "4 hari lalu",
 "keywords": ["villa", "rombongan", "gathering", "kolam renang"],
 "notes": "Kompleks 14 unit kayu, sering dipakai gathering kantor.",
 "score": 91, "scoreTier": "prioritas tinggi",
 "scoreReason": "Rating 4,7 dari 186 ulasan, 14 unit sewa, harga kelas menengah-atas, nomor WhatsApp aktif, listing terverifikasi, listing diperbarui 4 hari lalu — skor 91/100, prioritas tinggi",
 "scoreParts": [{ "key": "rating", "label": "Rating", "points": 25, "max": 25 }],
 "matchScore": 2, "matchedOn": ["kata kunci: gathering", "kata kunci: rombongan"],
 "status": "new", "alreadyInCrm": false, "existingLeadId": "",
 "leadDraft": { "name": "Villa Kayu Lembang", "phone": "0800-1000-0001", "address": "…", "source": "canvassing", "notes": "Prospek dari agen AI — …" }
}
```

**Skor tidak tergantung kueri.** Prospek yang skornya berubah antara dua
pencarian terbaca seperti bug. Relevansi terhadap kueri adalah `matchScore`
terpisah yang hanya memengaruhi urutan.

Bobot (total 100): rating 25, jumlah ulasan 20, skala usaha 20, kelas harga 15,
kanal WhatsApp 10, listing terverifikasi 5, kesegaran listing 5.
Tier: ≥80 prioritas tinggi · 60–79 layak dihubungi · 40–59 cadangan · <40 lewati dulu.

Urutan: `matchScore` desc → `score` desc → `reviewCount` desc → nama asc.

Error: `VALIDATION_ERROR` kalau `area` atau `category` tidak dikenal (pesannya
menyebutkan pilihan yang sah). `limit` dijepit diam-diam ke 1..24.

### `ai.draft.followup`

Goal dipilih berurutan, dan urutannya disebut apa adanya di `reason` supaya
pilihannya bisa dibantah:

1. `stage = in_progress` dan ≥7 hari diam → `reaktivasi`
2. `order_count > 0` → `repeat_order`
3. `stage = in_progress` → `tindak_lanjut_penawaran`
4. selain itu → `perkenalan`

```json
{
 "draft": {
  "templateId": "wa_reaktivasi_v1",
  "goal": "reaktivasi", "goalLabel": "Reaktivasi", "channel": "wa",
  "text": "Selamat siang, Kak Shauma. Saya Fajar dari WithMi.\nSaya cek catatan kami, obrolan terakhir kita 9 hari lalu…",
  "reason": "Lead ada di In Progress, 9 hari tanpa aktivitas, sudah 1x order — dipakai template reaktivasi",
  "waUrl": "https://wa.me/6288102213263?text=Selamat%20siang…",
  "vars": { "waktu": "siang", "sapaan": "Kak Shauma", "sales": "Fajar", "jeda_hari": 9 }
 },
 "alternatives": [{ "goal": "perkenalan", "goalLabel": "Perkenalan" }]
}
```

Tidak menulis apa pun. Jam sapaan dihitung WIB dari epoch
(`(Date.now()/3600000 + 7) % 24`), **bukan** `new Date().getHours()` — setelan
`timezone` workflow tidak memengaruhi `new Date()` di dalam Code node, dan
salah di sini menghasilkan "Selamat pagi" pukul sembilan malam.

Lead tanpa sales memakai pembuka berbeda ("Saya dari tim WithMi"), bukan nama
sales yang ditambal frasa umum.

Error: `NOT_FOUND` kalau lead tidak ada atau sudah diarsipkan;
`VALIDATION_ERROR` kalau `goal` tidak dikenal atau nomor WhatsApp-nya tidak valid.

### `ai.tasks.generate`

Memindai lead yang sudah ada. Tiga keluarga aturan:

**Follow-up** (maks 6/run) — `stage ∈ {todo, in_progress}` **dan**
(`is_stale = true` **atau** ≥3 hari diam). Bagian `atau` itu penting:
`CRM Stale Detector` hanya jalan pukul 08:00 WIB, jadi lead yang baru saja jadi
basi masih berbendera `false` dan antrian akan kosong saat demo siang hari.
Prioritas `min(100, 40 + hari×6 + (order>0 ? 10 : 0) + (B2B ? 10 : 0))`.

**Pindah stage** (maks 4/run):

| | Syarat | Usul | Prioritas |
|---|---|---|---|
| S1 | `todo` dan ≥1 activity `call`/`wa`/`visit` | → `in_progress` | 70 |
| S2 | `in_progress`, `order_count ≥ 1`, ada catatan mengandung transfer/dp/lunas/closing/invoice | → `won` | 80 |
| S3 | `in_progress` dan ≥14 hari tanpa respons | → `lost` | 55 |

S2 satu-satunya aturan yang membaca isi catatan bebas. Potongan kalimatnya ikut
dikutip di `reason` supaya operator bisa menilai sendiri apakah tebakannya
masuk akal. S3 adalah usulan yang merusak — justru itu alasan antrian
persetujuan ini ada.

**Prospek baru** (maks 1/run) — kalau ada ≥3 prospek berstatus `new` dengan skor
≥70, ambil 8 teratas.

**Dedup:** dilewati kalau ada tugas `pending` dengan `dedupe_key` sama, atau
yang `approved` kurang dari 24 jam lalu. Akibatnya **klik "Cari usulan" yang
kedua memang mengembalikan `created: 0`** — UI harus menyatakan itu, bukan diam
saja.

### `ai.tasks.decide`

`overrides.text` dipakai untuk draf yang disunting operator. Tanpa itu,
activity yang tercatat tidak sama dengan pesan yang benar-benar dikirim.

Hasil per jenis: `prospect_batch` mengembalikan bentuk yang sama dengan
`leads.bulkCreate` plus `categorizations`, `assignments`, dan
`convertedProspects`. Bedanya satu: **`invalid` di sini angka, dan daftarnya di
`invalidItems`** — gateway lama mengirim `invalid` sebagai array padahal
kontraknya angka, sehingga di dashboard selalu terbaca 0.

**Efek yang gagal dibalas HTTP 200**, bukan error, dengan `task.status =
"failed"` dan `result.error` terisi. Alasannya: kalau dibalas error, klien
tidak tahu apakah baris tugasnya sudah berpindah, dan antrian harus diambil
ulang untuk mencari tahu. Dengan cara ini barisnya sendiri yang menjadi catatan
kegagalan.

Error: `NOT_FOUND` (tugas tidak ada), `VALIDATION_ERROR` (`decision` bukan
approve/reject, tugas sudah diputuskan, teks kosong).

## Data table baru

| Nama | ID |
|---|---|
| `crm_prospects` | `Bt4eJ0TOkiIhH8c9` — 24 baris, kolam prospek |
| `crm_ai_tasks` | `yf9VcYN1Ym5bV9BL` — antrian persetujuan, mulai kosong |

`crm_prospects` menyimpan **`last_seen_days` (angka), bukan tanggal**. Tanggal
keras akan menua: dua bulan setelah seeding semua listing berbunyi "diperbarui
3 bulan lalu" dan sinyal kesegaran mati diam-diam. Offset membuat kolam ini
awet, dan membuat skor jadi fungsi murni dari barisnya — gampang diuji.

Siklus tugas sengaja **empat** status, bukan lima: `pending → approved |
rejected | failed`. Tidak ada `executing` karena `ai.tasks.decide` berjalan
sinkron, dan mengarang status async yang tidak pernah dimasuki adalah cara
demo berakhir dengan baris yang nyangkut selamanya.

## Cara men-deploy ulang workflow-nya

Sudah di-deploy sebagai `FF6HJ35DQY08mQ4O`. Untuk mengubahnya, sunting
`n8n/ai-gateway.workflow.js` lalu deploy ulang dari file itu — jangan menambal
hasil deploy-nya lewat n8n UI, karena file ini yang jadi sumber kebenaran.

```
n8n MCP → create_workflow_from_code
  projectId: jybGqjoYSN755zQt   (Demo Prototype)
  folderId:  Yek3LEEHwKm9Dyv9   (Demo Leads - Shabu Ajhi - Hnry)
  code:      isi n8n/ai-gateway.workflow.js
```

**`folderId` wajib diisi.** Tanpa itu workflow mendarat di akar project, bukan
di folder bersama ketiga workflow CRM lain. MCP n8n **tidak punya operasi pindah
folder** — `folderId` hanya ada saat pembuatan, `update_workflow` tidak bisa
mengubahnya — jadi salah folder cuma bisa dibetulkan dengan menyeretnya di UI
atau membuat ulang workflow-nya (ID dan riwayat eksekusi ikut berganti).

Lalu `publish_workflow`, pastikan `N8N_CRM_AI_URL` terisi di `.env.local`, dan
uji dengan alur di README bagian "Agen AI". Restart `next dev` setelah mengubah
`.env.local` — variabel sisi server dibaca saat server start.

Penanda tembus-tidaknya adalah header `x-crm-source` dari `app/api/crm/route.ts`:
`n8n` berarti live, `mock` berarti jatuh ke data contoh dan alasannya ada di
`x-crm-fallback-reason`.

---

# CRM Demo Reset — endpoint ketiga

> **Status: sudah di-deploy dan aktif.** Workflow `CRM Demo Reset`
> (`mLydCvrc0jDlUuaK`, 26 node) berjalan di project Demo Prototype dari sumber
> [`n8n/demo-reset.workflow.js`](demo-reset.workflow.js). Auth dan envelope-nya
> salinan persis `CRM API Gateway` — kunci API yang sama, URL yang berbeda.

## Endpoint

```
POST https://n8n.withmiautomation.com/webhook/simple-crm-demo-reset
x-api-key: <crm_config.api_key>
```

## `demo.reset`

Mengembalikan seluruh data demo ke keadaan awal: menghapus isi `crm_leads`,
`crm_activities`, `crm_sales`, `crm_ai_tasks`, mengembalikan setiap baris
`crm_prospects` ke `status: "new"`, lalu menyisipkan ulang dari tiga tabel
seed.

Request:

```json
{ "action": "demo.reset", "payload": { "confirm": "RESET" } }
```

`confirm` wajib bernilai persis `"RESET"`. Nilai lain ditolak dengan
`VALIDATION_ERROR` **sebelum satu baris pun terhapus**:

```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "confirm harus bernilai \"RESET\"" }, "meta": { ... } }
```

Balasan sukses:

```json
{
  "ok": true,
  "data": {
    "seededAt": "2026-09-16T16:49:15.731Z",
    "deleted": { "leads": 25, "activities": 49, "sales": 6, "prospects": 0, "aiTasks": 6 },
    "inserted": { "leads": 10, "activities": 26, "sales": 4, "prospects": 24 }
  },
  "meta": { "requestId": "720508", "ts": "2026-09-16T16:49:16.646Z" }
}
```

`deleted.prospects` **selalu 0**: prospek tidak pernah dihapus, hanya
di-update. Jumlah prospek yang dikembalikan ke `new` muncul di
`inserted.prospects`.

## Tabel seed

| Nama | ID | Baris |
|---|---|---|
| `crm_seed_sales` | `pNZch0ctkbvwHpfx` | 4 |
| `crm_seed_leads` | `ZbQo7aPlufhcRdHC` | 10 |
| `crm_seed_activities` | `1vQzBx0do5a3pjTw` | 26 |

Ketiganya ditangkap dari keadaan live sekali oleh
[`n8n/seed-capture.mjs`](seed-capture.mjs). Relasi disimpan sebagai **indeks,
bukan ID**: `crm_seed_leads.owner_index` menunjuk `crm_seed_sales.seed_index`,
dan `crm_seed_activities.lead_index` menunjuk `crm_seed_leads.seed_index`. ID
baris asli tidak berarti apa-apa setelah tabel dikosongkan, jadi workflow
memasangkan indeks itu ke ID baru berdasarkan **posisi** hasil insert — karena
itu urutannya mengikat: sales dulu, lalu lead, lalu activity.

Waktu juga disimpan sebagai offset (`created_minutes_ago`,
`last_activity_minutes_ago`), bukan tanggal keras, dengan alasan yang sama
seperti `crm_prospects.last_seen_days`: tanggal keras menua, dan sebulan lagi
seluruh timeline demo akan berbunyi "sebulan lalu".

## Tidak ada `crm_seed_prospects`

Prospek **di-reset di tempat** dengan satu node `update`
(`status: "new"`, `converted_lead_id: ""`, `converted_at: ""`), tidak pernah
dihapus dan disisipkan ulang. Kolam prospek tidak punya tabel seed, jadi
menghapusnya berarti kehilangannya selamanya.

## Penjaga seed kosong

`Plan Reset` membaca ketiga tabel seed dan menolak kalau `crm_seed_sales` atau
`crm_seed_leads` kosong — **sebelum** penghapusan pertama. Workflow yang
menghapus dulu lalu menemukan seed kosong meninggalkan demo kosong permanen,
dan tidak ada cara memulihkannya.

## `crm_config` tidak pernah disentuh

Tidak ada node hapus atau update yang menunjuk `GlW1ROM8sSfdO7LA`. Node
`Load Config` hanya membacanya untuk auth. Di sanalah `api_key` yang dipakai
ketiga gateway tinggal; menghapusnya mematikan seluruh dashboard dan tidak ada
backup yang memulihkan kredensial hidup dengan bersih.

## Idempoten

Menjalankan reset dua kali berturut-turut menghasilkan angka `inserted` yang
sama persis. Data table n8n mengulang auto-increment dari 1 setelah tabelnya
kosong, jadi ID baris pun identik antar-reset — bukan sesuatu yang dijanjikan
kontrak, tapi berguna waktu demo.

## Cara men-deploy ulang

Sama seperti gateway lain: sunting `n8n/demo-reset.workflow.js`, lalu

```
n8n MCP → create_workflow_from_code
  projectId: jybGqjoYSN755zQt   (Demo Prototype)
  folderId:  Yek3LEEHwKm9Dyv9   (Demo Leads - Shabu Ajhi - Hnry)
  code:      isi n8n/demo-reset.workflow.js
```

lalu `publish_workflow`. `folderId` wajib — alasannya sama seperti di bagian
AI Gateway.
