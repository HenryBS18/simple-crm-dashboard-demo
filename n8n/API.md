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
| Data table crm_leads | `048bYoe3wwNXPwmS` |
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
