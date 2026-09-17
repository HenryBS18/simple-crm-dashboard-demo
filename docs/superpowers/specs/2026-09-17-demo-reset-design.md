# Tombol reset demo, dan pencabutan mock dari frontend

Tanggal: 2026-09-17

## Masalah

Dashboard ini dipakai demo di depan klien, dan tiap demo mengotori data: lead
baru, stage berpindah, activity menumpuk, prospek jadi `converted`. Tidak ada
cara mengembalikannya selain menyunting data table n8n satu per satu.

Dua hal yang memperburuk:

1. **Tidak ada definisi "seed awal" di mana pun.** Seed di `lib/mock.ts` bukan
   data yang ada di n8n — dari 10 nama, hanya Ova Villa dan Bella yang beririsan.
   Data live di-seed manual waktu membangun n8n dan tidak pernah direkam.
2. **Data live menua diam-diam.** Tanggalnya absolut, jadi lead yang hari ini
   berbunyi "6 hari tanpa aktivitas" akan berbunyi "40 hari" bulan depan. Itu
   mematikan logika `is_stale` dan pemilihan template agen.

Terpisah dari itu, mock menyimpan satu titik buta: `app/api/crm/route.ts:114-124`
jatuh ke `lib/mock.ts` kalau n8n tidak tersedia, dan `lib/crm.ts:65-75` membuang
header `x-crm-source` untuk action `ai.*` — jadi tab Agen AI bisa berjalan di
atas data contoh tanpa satu pun penanda di layar.

## Hasil yang dituju

Satu tombol di dashboard yang mengembalikan seluruh data demo ke kondisi awal
yang **segar**, dengan seed yang hidup di n8n dan bisa disunting di sana. Dan
frontend yang tidak lagi menyimpan data contoh apa pun.

## Keputusan yang mengunci desain

| Keputusan | Pilihan |
|---|---|
| Sasaran reset | Keadaan live saat ini dikurangi jejak uji coba, direkam jadi tabel seed |
| Tempat reset berjalan | Workflow n8n baru dan terpisah |
| Pengaman | Dialog konfirmasi dengan tombol destructive |
| Sumber seed | Data table n8n, bukan berkas di repo |
| Mock di frontend | Dicabut, bersama `lib/ai-rules.ts` |

## Arsitektur

### Workflow `CRM Demo Reset`

Workflow n8n ketiga, webhook `simple-crm-demo-reset`, di project Demo Prototype
(`jybGqjoYSN755zQt`) folder `Yek3LEEHwKm9Dyv9`. Auth dan envelope adalah salinan
persis kedua gateway lain: `x-api-key` dari `crm_config.api_key`, balasan
`{ ok, data, meta }`.

Dipisah karena ini satu-satunya jalur yang menghapus data. Alasannya sama dengan
yang sudah ditetapkan di `n8n/API.md` untuk AI Gateway, dan di sini bobotnya
lebih besar. Efek samping yang berguna: `unpublish_workflow` mematikan tombol
reset tanpa rebuild frontend.

Dashboard memilih URL dari prefiks action di `lib/n8n.ts:24-28` — cabang ketiga,
`demo.` → `N8N_CRM_RESET_URL`, meniru pola `ai.` yang sudah ada.

### Tabel seed

Empat data table baru. Bisa disunting langsung di UI n8n; itu yang membuat seed
"hidup di n8n" dan bukan di repo.

Bedanya dari tabel live adalah inti desainnya: **seed tidak menyimpan ID dan
tidak menyimpan tanggal absolut.**

| Tabel | Kolom |
|---|---|
| `crm_seed_sales` | `seed_index` (number), `name`, `phone`, `active` (boolean) |
| `crm_seed_leads` | `seed_index` (number), `name`, `type`, `phone`, `phone_raw`, `address`, `source`, `stage`, `owner_index` (number), `order_count` (number), `value_estimate` (number), `notes`, `classify_reason`, `is_stale` (boolean), `created_minutes_ago` (number), `last_activity_minutes_ago` (number) |
| `crm_seed_activities` | `lead_index` (number), `type`, `content`, `actor`, `created_minutes_ago` (number) |
| `crm_seed_prospects` | semua kolom `crm_prospects` kecuali `status`, `converted_lead_id`, `converted_at` |

Relasi disimpan per indeks (`lead_index`, `owner_index`) dan dipetakan ke ID
sungguhan saat insert. Waktu disimpan sebagai offset menit dan dihitung relatif
terhadap jam reset — itu yang membuat tiap reset menghasilkan demo segar, bukan
tanggal beku. Satuan menit dipakai seragam supaya beberapa activity di hari yang
sama tidak saling menimpa.

`crm_seed_prospects` tidak butuh kolom waktu: `last_seen_days` di tabel live
memang sudah relatif. Kolom `status` selalu diisi `new`, `converted_lead_id` dan
`converted_at` selalu kosong.

### Alur eksekusi

Urutannya mengikat, karena lead butuh `owner_id` dari sales dan activity butuh
`lead_id` dari lead:

1. Auth & parse, validasi `payload.confirm === "RESET"`
2. Baca keempat tabel seed
3. **Gagalkan kalau `crm_seed_leads` atau `crm_seed_sales` kosong** —
   `VALIDATION_ERROR`, tanpa menghapus apa pun
4. Hapus semua baris di `crm_leads`, `crm_activities`, `crm_sales`,
   `crm_prospects`, `crm_ai_tasks` (`deleteRows`, filter `id gte 1`)
5. Insert `crm_sales` → tangkap ID per indeks
6. Insert `crm_leads` dengan `owner_id`/`owner_name` hasil pemetaan, tanggal
   dihitung dari offset → tangkap ID per indeks
7. Insert `crm_activities` dengan `lead_id` hasil pemetaan
8. Insert `crm_prospects`, `status: 'new'`
9. Hitung `lead_count` tiap sales dari lead yang tersisip, update `crm_sales`
10. Balas jumlah terhapus dan tersisip

`crm_ai_tasks` dikosongkan tanpa seed: antrian agen memang harus mulai kosong.

`crm_config` **tidak pernah disentuh**. Menghapusnya berarti membunuh auth
ketiga gateway sekaligus.

Pemetaan indeks → ID bersandar pada urutan: node insert hanya mengembalikan
`{id, createdAt, updatedAt}`, jadi hasilnya dipasangkan kembali ke baris yang
direncanakan berdasarkan posisi. Trik ini sudah dipakai `CRM Lead Intake` dan
node `Shape Task Insert` di AI Gateway.

Node pembaca **wajib `executeOnce: true`**. Node dataTable berjalan sekali per
item masuk, dan pembaca yang dirantai seri tanpa ini menggandakan hasilnya —
persis bug yang baru ditemukan di AI Gateway (8712 baris prospek dari 24).

### Batasan yang diterima sadar

**Tidak ada transaksi.** n8n tidak punya rollback. Kalau eksekusi mati di antara
langkah 4 dan 8, tabel tinggal separuh terisi. Mitigasinya: seluruh pembacaan
seed dan pemeriksaan kekosongan terjadi **sebelum** penghapusan pertama, dan
balasan memuat jumlah terhapus/tersisip sehingga run separuh jalan langsung
kelihatan. Kalau terjadi, tekan reset sekali lagi — operasinya idempoten.

**ID tidak pernah kembali ke 1.** Data table n8n auto-increment dan tidak bisa
di-reset. Setelah reset pertama lead jadi ID 20-an, reset berikutnya 30-an, terus
naik. Tautan lama seperti `/leads/3` akan mati. Untuk demo ini diterima.

## Kontrak action

Satu action baru, mengikuti pola 20 action yang sudah ada di `lib/schema.ts`.

```
demo.reset
  payload: { confirm: "RESET" }
  data:    { seededAt, deleted: { leads, activities, sales, prospects, aiTasks },
             inserted: { leads, activities, sales, prospects } }
```

`confirm` selain `"RESET"` → 400 `VALIDATION_ERROR`. Pemeriksaan ini ada di n8n,
bukan hanya di UI, supaya tombol tidak bisa dilewati lewat curl tanpa sengaja.

Berkas yang disentuh: `lib/schema.ts` (definisi action + tiga tipe yang pindah
dari `ai-rules`), `lib/crm.ts` (`resetDemo()`), `lib/queries.ts`
(`useResetDemo()` yang menginvalidasi seluruh key).

## UI

Tombol di `components/shell/topbar.tsx`, membuka modal konfirmasi. Tidak ada
isian teks: tombol "Reset sekarang" langsung aktif dan hanya mati selama
request berjalan. Nilai `confirm: "RESET"` yang dituntut kontrak dikirim
otomatis oleh `resetDemo()` di `lib/crm.ts`.

Dialog menyebut apa yang akan hilang dengan angka, bukan peringatan umum —
misalnya "18 lead, 43 activity, dan 4 tugas agen akan dihapus". Angkanya diambil
dari data yang sudah ada di cache, bukan request tambahan.

Sukses → seluruh query di-invalidate dan toast menampilkan jumlah baris terhapus
dan tersisip. Gagal → pesan error dari n8n apa adanya.

Dipakai ulang: komponen dialog di `components/ui/` dan pola mutation di
`lib/queries.ts` yang sudah dipakai `useDeleteLead`.

## Pencabutan mock

`lib/mock.ts` (1569 baris) diimpor tepat satu berkas, `app/api/crm/route.ts:2`.
`PROSPECT_SEED` dan `seedToRow` di `lib/ai-rules.ts` dipakai hanya oleh
`lib/mock.ts`. Tidak ada komponen yang mengimpor `ai-rules`. Pencabutannya
karena itu bersih.

- Hapus `lib/mock.ts` dan `lib/ai-rules.ts` (~3082 baris)
- Pindahkan `AiTaskKind`, `AiTaskStatus`, `FollowupGoal` ke `lib/schema.ts` —
  tiga tipe itu satu-satunya yang masih dipakai (`lib/schema.ts:2`)
- `app/api/crm/route.ts`: buang `serveFromMock` dan kedua cabangnya. n8n tidak
  tersedia → **503** dengan `detail` dari `callN8n` apa adanya
- `lib/n8n.ts`: buang `demoModeForced()`
- `lib/crm.ts:65-75`: penjejakan `x-crm-source` kehilangan gunanya karena
  sumbernya selalu n8n. Buang, dan alirkan pesan error ke UI sebagai gantinya
- Buang `NEXT_PUBLIC_DEMO_MODE` dan `CRM_MOCK_FAIL` dari `.env.example`,
  `.env.local`, dan tabel env di `README.md:31-33`; perbarui bagian "Mode demo"
  di `README.md:35-47`

Konsekuensi yang diterima sadar: **jaring pengaman demo hilang.** `README.md:37-40`
sebelumnya menjanjikan papan tidak pernah kosong meskipun backend mati. Setelah
ini, webhook tersendat di depan klien berarti layar error. Yang didapat sebagai
gantinya: tidak ada lagi jalur diam-diam yang membuat dashboard terlihat normal
padahal backend mati — titik buta yang sebelumnya tidak punya penanda sama sekali
di tab Agen AI.

## Mengisi tabel seed

Sekali jalan, sebelum workflow dipakai. Sumbernya keadaan live sekarang dikurangi
jejak uji coba 2026-09-16:

- Buang lead `12`–`19` (prospek canvassing hasil approve `prospect_batch`)
- Buang **sepuluh** activity: `34` (stage_change pada Ova Villa), `35`–`42`
  (activity `created` milik lead `12`–`19`, satu per lead dari CRM Lead Intake),
  dan `43` (wa pada Ova Villa)
- Kembalikan Ova Villa (lead `1`) ke `stage: todo`
- Kembalikan 8 baris `crm_prospects` dari `converted` ke `new`
- `crm_ai_tasks` tidak diseed

Sisanya — 10 lead, 4 sales, 33 activity, 24 prospek — ditulis ke tabel seed.

Konversi waktunya: ambil `created_at` activity paling baru yang tersisa sebagai
titik nol, lalu simpan tiap `created_at`/`last_activity_at` sebagai selisih menit
ke belakang dari titik itu. Saat reset, titik nol menjadi jam reset. Jadi jarak
antar-peristiwa terjaga persis, tapi seluruh timeline selalu berakhir "barusan".

`last_activity_at` asli Ova Villa sebelum disentuh uji coba tidak terekam di mana
pun. Nilainya diturunkan dari activity seed paling baru milik lead itu (`id 24`),
sehingga konsisten dengan timeline-nya.

Penekanan tombol reset yang pertama sekaligus menjadi pembersihan jejak uji coba.
Tidak perlu workflow hapus sementara.

## Verifikasi

**Workflow, langsung ke webhook:**

1. `confirm` salah → 400 `VALIDATION_ERROR`, dan `leads.list` membuktikan tidak
   ada yang terhapus
2. Tabel seed sengaja dikosongkan → `VALIDATION_ERROR`, tabel live utuh
3. Reset normal → jumlah terhapus dan tersisip sesuai
4. `leads.list` → 10 lead, `owner_name` terisi benar, `stage` sesuai seed
5. Activity tiap lead → jumlah dan urutannya sesuai seed, `lead_id` menunjuk lead
   yang benar
6. `ai.bootstrap` → `pool.total` 24 semuanya `new`, `tasks.total` 0
7. `crm_sales.lead_count` cocok dengan jumlah lead per owner
8. Reset kedua langsung setelahnya → idempoten, hasil sama persis kecuali ID naik
9. Umur data: `leads.list` setelah reset tidak boleh memuat lead yang lebih tua
   dari offset seed terbesar

**Dashboard:**

10. Tombol reset: modal terbuka tanpa isian teks; "Batal"/Esc menutup tanpa efek
11. Reset dari UI → papan, tabel lead, halaman sales, dan tab Agen AI semuanya
    menampilkan data seed tanpa perlu refresh manual
12. `N8N_CRM_URL` dikosongkan → `/api/crm` membalas **503**, bukan data contoh;
    layar menampilkan error, bukan papan terisi
13. `npx biome check` bersih; `npx next build` lolos tanpa `lib/mock.ts` dan
    `lib/ai-rules.ts`
14. `grep -rn "mock\|PROSPECT_SEED" app lib components` tidak menyisakan apa pun

## Yang sengaja tidak dikerjakan

- **Pratinjau `dryRun`.** Node `deleteRows` mendukungnya, tapi modal konfirmasi
  sudah cukup sebagai pengaman untuk dashboard demo. Menambah mode pratinjau
  berarti satu cabang lagi yang harus diuji tanpa pemakai yang memintanya.
- **Reset selektif per tabel.** Semua atau tidak sama sekali. Reset separuh
  menghasilkan activity yatim dan lebih berbahaya daripada berguna.
- **Snapshot/undo.** Reset tidak bisa dibatalkan. Kalau nanti dibutuhkan, itu
  fitur tersendiri dengan penyimpanan tersendiri.
