# CRM — dashboard demo

Papan kanban lead dan panel detail kontak untuk tim sales. Tidak punya database
sendiri: satu-satunya sumber data adalah webhook n8n (`CRM API Gateway`), dan
seluruh permintaan lewat route handler `app/api/crm/route.ts` supaya API key
tidak pernah sampai ke browser. Kontrak backend ada di [`n8n/API.md`](n8n/API.md).

## Menjalankan

```bash
npm install
cp .env.example .env.local   # lalu isi N8N_CRM_API_KEY
npm run dev                  # http://localhost:3000
```

Perintah lain:

```bash
npm run build     # build produksi, termasuk type check
npm run lint      # Biome (bukan ESLint)
npm run format    # Biome formatter
npx next typegen  # regenerate PageProps/LayoutProps setelah menambah route
```

## Environment

| Variabel | Wajib | Keterangan |
|---|---|---|
| `N8N_CRM_URL` | ya, untuk mode live | `https://n8n.withmiautomation.com/webhook/simple-crm-demo-api` |
| `N8N_CRM_API_KEY` | ya, untuk mode live | Data table `crm_config` baris `api_key`. n8n Variable `CRM_API_KEY` menang kalau diisi. Hanya dibaca di server. |
| `N8N_CRM_AI_URL` | tidak | Webhook `CRM AI Gateway`, mis. `https://n8n.withmiautomation.com/webhook/simple-crm-demo-ai`. Dipakai khusus action `ai.*`; API key-nya sama dengan di atas. Kalau kosong, hanya tab Agen AI yang memakai data contoh — papan tetap live. |
| `NEXT_PUBLIC_DEMO_MODE` | tidak | `true` memaksa data contoh. Biarkan `true` sampai dua nilai di atas terisi. |
| `CRM_MOCK_FAIL` | tidak | Khusus pengembangan. Isi nama action, mis. `leads.move`, untuk memaksa action itu gagal — dipakai menguji rollback optimistic. |

## Mode demo

Aplikasi memakai data contoh kalau `NEXT_PUBLIC_DEMO_MODE=true`, **atau** env n8n
kosong, **atau** n8n gagal dihubungi (timeout 8 detik, error jaringan, 5xx,
respons di luar kontrak). Jadi papan tidak pernah kosong waktu presentasi
meskipun backend mati di tengah jalan.

Sumber data dikirim balik lewat header `x-crm-source: mock | n8n` — bukan lewat
body, supaya kontrak `{ ok, data, meta }` tidak berubah. Header itu yang
menyalakan badge "Data contoh" di header aplikasi.

Data contoh bersifat stateful di memori server: tambah lead, pindah kolom, ganti
owner, dan tulis catatan semuanya bekerja. State-nya hilang saat server restart.

## Agen AI

Tab keempat (`/agent`) memperagakan tiga hal yang bisa dikerjakan sistem
sendiri, dan ketiganya menulis ke lead yang sama dengan papan:

1. **Prospektor** — menelusuri kolam prospek penginapan di data table n8n
   `crm_prospects` (24 baris villa, glamping, dan camping ground area Bandung),
   menyaring yang nomornya sudah ada di CRM, lalu memberi skor 0–100.
2. **Antrian persetujuan** — memindai lead yang sudah ada dan mengusulkan
   follow-up, perpindahan stage, atau memasukkan prospek baru. Tidak ada yang
   berubah sebelum tombol Setujui ditekan.
3. **Draf WhatsApp** — menyusun pesan dari template, boleh disunting, lalu
   dicatat sebagai activity bertipe `wa` dan membuka `wa.me` dengan pesan
   sudah terisi. Tombol kirimnya tetap ditekan manusia.

**Tidak ada LLM di sini.** Skoring dan pemilihan template deterministik, dan
kernelnya ada di `lib/ai-rules.ts` — satu berkas yang juga disalin ke tiap Code
node di workflow n8n. Konsekuensinya setiap keluaran **membawa alasannya
sendiri**, mengikuti pola `classify_reason` yang sudah ada: skor prospek punya
`scoreReason`, tiap usulan punya `reason`, tiap draf menyebut template dan data
yang dipakainya. Titik tukar ke LLM asli nanti cuma satu node di n8n — kontrak
action-nya tidak perlu berubah.

Action `ai.*` dilayani **webhook n8n kedua**, bukan `CRM API Gateway`. Gateway
lama berukuran ~100 ribu karakter JSON dan menopang seluruh papan; menambah
cabang ke dalamnya lewat API berarti menulis ulang seluruh workflow untuk
perubahan yang sifatnya menambah saja. Dengan dipisah, bug di sisi agen paling
jauh hanya mematikan satu tab.

Nomor telepon kolam prospek semuanya di rentang `0800-1000-00NN`. Baris ini
benar-benar masuk ke `crm_leads` dan tombol WhatsApp-nya bisa diklik, jadi
nomornya tidak boleh milik orang sungguhan — `0800` adalah rentang bebas-pulsa
yang tidak pernah menjadi nomor seluler.

Lead hasil prospek memakai `source: canvassing`, bukan sumber baru: node
`Plan Intake` di n8n menulis ulang sumber tak dikenal menjadi `manual` tanpa
error. Jejak asal-usulnya ada di `notes`.

Status workflow n8n-nya ada di [`n8n/API.md`](n8n/API.md) bagian
"CRM AI Gateway".

## Peta kode

```
app/
  page.tsx                papan kanban (layar utama)
  leads/page.tsx          tabel lead
  leads/[id]/page.tsx     detail yang bisa di-share (params adalah Promise)
  sales/page.tsx          kelola sales (tambah, ubah, aktif/nonaktif)
  agent/page.tsx          tab Agen AI: prospektor + antrian persetujuan
  api/crm/route.ts        proxy ke n8n + fallback data contoh
components/
  agent/                  prospektor, tabel kandidat, antrian, dialog draf WA
  board/                  papan, kolom, kartu, menu "Pindahkan ke"
  lead/                   panel detail (dipakai drawer dan halaman), modal tambah lead
  leads/                  tabel
  sales/                  tabel sales + dialog tambah/ubah
  shell/                  topbar, filter, strip angka, badge segmen
  ui/                     shadcn
lib/
  ai-rules.ts             otak agen: kolam prospek, skoring, template, heuristik
  schema.ts               zod: entitas + payload/data tiap action (sumber tipe)
  crm.ts                  callCrm<A> terketik + wrapper per action
  n8n.ts                  server-only, satu-satunya pembaca API key
  mock.ts                 data contoh stateful, 21 action
  queries.ts              hook TanStack Query + mutation optimistic
  filters.ts, format.ts, stage.ts
```

Catatan teknis:

- Kolom kanban dirender dari urutan `stages` yang dikembalikan `bootstrap`,
  tidak di-hardcode. Labelnya dipaksa ke label klien lewat `lib/stage.ts`.
- Seluruh papan hidup dari satu panggilan `leads.list` (limit 100) di satu entri
  cache. Filter, pencarian, dan pembagian kolom dikerjakan di client.
- Filter dan kartu yang sedang terbuka disimpan di URL (`?seg=&sales=&q=&lead=`)
  supaya link bisa dibagikan saat demo.
- Lint memakai **Biome**, bukan ESLint. `next lint` tidak ada lagi di Next 16.
- Lead bisa dihapus dari panel detail, dan itu **soft delete**: barisnya tetap ada
  di data table `crm_leads` dengan kolom `deleted_at` terisi, cuma disaring dari
  `leads.list`, `leads.get`, dan `stats.summary`. Toast sukses menyediakan
  "Urungkan" yang memanggil `leads.restore`; kalau toast-nya sudah lewat,
  pemulihan manual tinggal mengosongkan `deleted_at` di data table n8n.
- Sales tidak bisa dihapus — kontrak n8n tidak punya `sales.delete` dan baris data
  table tidak bisa dibuang lewat API. Yang tersedia cuma status Aktif/Nonaktif.
  Sales nonaktif tidak pernah kebagian penugasan otomatis.
