/**
 * Otak agen prospek & follow-up. Deterministik: tidak ada LLM di sini, dan
 * tidak akan ada selama `n8n/API.md` masih menjanjikan hasil yang sama untuk
 * masukan yang sama.
 *
 * KEEP IN SYNC WITH n8n "CRM AI Gateway": tiap Code node di workflow itu
 * memegang salinan fungsi di file ini. Angka bobot, ambang tier, dan seluruh
 * kalimat Bahasa Indonesia di bawah adalah kontrak bersama — mengubahnya di
 * satu sisi saja membuat lead yang sama dibaca berbeda tergantung backend mana
 * yang sedang hidup.
 *
 * Isinya nyaris bebas import supaya bisa disalin apa adanya ke Code node n8n;
 * dua helper yang diimpor (`normalizePhone`, `stageLabel`) harus di-inline di
 * salinan n8n-nya.
 */

import { normalizePhone } from "@/lib/format";
import type { Activity, Lead, Stage } from "@/lib/schema";
import { stageLabel } from "@/lib/stage";

/* ── Kosakata ─────────────────────────────────────────────────────────────── */

export type ProspectCategory = "villa" | "glamping" | "camping";
export type ProspectArea =
  | "lembang"
  | "pangalengan"
  | "ciwidey"
  | "dago"
  | "cisarua";
export type PriceBand = "budget" | "mid" | "premium";
export type ProspectStatus = "new" | "queued" | "converted" | "skipped";

export const AREA_LABELS: Record<ProspectArea, string> = {
  lembang: "Lembang",
  pangalengan: "Pangalengan",
  ciwidey: "Ciwidey",
  dago: "Dago",
  cisarua: "Cisarua",
};

export const CATEGORY_LABELS: Record<ProspectCategory, string> = {
  villa: "Villa",
  glamping: "Glamping",
  camping: "Camping ground",
};

/** Satuan skala per kategori, supaya alasan skor terbaca wajar. */
export const UNIT_WORDS: Record<ProspectCategory, string> = {
  villa: "unit sewa",
  glamping: "tenda glamping",
  camping: "lapak tenda",
};

export const PRICE_BAND_LABELS: Record<PriceBand, string> = {
  budget: "harga kelas ekonomi",
  mid: "harga kelas menengah",
  premium: "harga kelas menengah-atas",
};

/**
 * Sumber lead yang diterima backend, disalin dari `VALID_SOURCES` di node
 * `Plan Intake`. Node itu **menulis ulang sumber tak dikenal menjadi "manual"
 * tanpa error**, jadi sumber karangan seperti "ai_prospect" akan hilang diam-
 * diam. Prospek memakai "canvassing"; jejak asal-usulnya ditaruh di `notes`.
 */
export const PROSPECT_LEAD_SOURCE = "canvassing";

/* ── Kolam prospek ────────────────────────────────────────────────────────── */

export type ProspectSeed = {
  seq: number;
  name: string;
  category: ProspectCategory;
  area: ProspectArea;
  address: string;
  phoneRaw: string;
  rating: number;
  reviewCount: number;
  unitCount: number;
  priceBand: PriceBand;
  priceNote: string;
  sourceLabel: string;
  hasWhatsapp: boolean;
  verified: boolean;
  /**
   * Jarak hari, bukan tanggal. Tanggal keras akan menua: dua bulan setelah
   * seeding semua listing berbunyi "diperbarui 3 bulan lalu" dan sinyal
   * kesegaran mati diam-diam. Offset membuat kolam ini awet, dan membuat skor
   * jadi fungsi murni dari barisnya — gampang diuji.
   */
  lastSeenDays: number;
  keywords: string[];
  notes: string;
};

/**
 * Nomor memakai rentang **0800**, bukan prefiks seluler. 0811–0859 dan
 * 0877–0899 adalah nomor seluler sungguhan; mengarang di sana berisiko
 * mengenai orang. 0800 adalah rentang bebas-pulsa yang tidak pernah menjadi
 * nomor seluler, jadi wa.me untuk nomor ini dijamin "tidak terdaftar di
 * WhatsApp" — aman meski barisnya benar-benar masuk ke CRM dan tombolnya
 * diklik di depan klien.
 */
export const PROSPECT_SEED: ProspectSeed[] = [
  {
    seq: 1,
    name: "Villa Kayu Lembang",
    category: "villa",
    area: "lembang",
    address: "Jl. Kolonel Masturi No. 112, Cisarua, Lembang",
    phoneRaw: "0800-1000-0001",
    rating: 4.7,
    reviewCount: 186,
    unitCount: 14,
    priceBand: "premium",
    priceNote: "Rp1,2jt–2,4jt / malam",
    sourceLabel: "Direktori Villa Bandung Raya",
    hasWhatsapp: true,
    verified: true,
    lastSeenDays: 4,
    keywords: ["villa", "rombongan", "gathering", "kolam renang"],
    notes: "Kompleks 14 unit kayu, sering dipakai gathering kantor.",
  },
  {
    seq: 2,
    name: "Villa Panorama Cikole",
    category: "villa",
    area: "lembang",
    address: "Jl. Raya Cikole KM 8, Lembang",
    phoneRaw: "0800-1000-0002",
    rating: 4.5,
    reviewCount: 92,
    unitCount: 8,
    priceBand: "mid",
    priceNote: "Rp500rb–900rb / malam",
    sourceLabel: "Marketplace Sewa Villa Jabar",
    hasWhatsapp: true,
    verified: true,
    lastSeenDays: 9,
    keywords: ["villa", "keluarga", "bbq"],
    notes: "Villa keluarga dekat Cikole, ada area BBQ.",
  },
  {
    seq: 3,
    name: "Glamping Lereng Tangkuban",
    category: "glamping",
    area: "lembang",
    address: "Jl. Tangkuban Parahu KM 3, Lembang",
    phoneRaw: "0800-1000-0003",
    rating: 4.6,
    reviewCount: 141,
    unitCount: 22,
    priceBand: "mid",
    priceNote: "Rp600rb–1jt / tenda",
    sourceLabel: "Listing Komunitas Glamping Jabar",
    hasWhatsapp: true,
    verified: true,
    lastSeenDays: 6,
    keywords: ["glamping", "tenda", "pemandangan"],
    notes: "22 tenda glamping menghadap Tangkuban Parahu.",
  },
  {
    seq: 4,
    name: "Bumi Perkemahan Cikole Asri",
    category: "camping",
    area: "lembang",
    address: "Jl. Raya Cikole, Sukajaya, Lembang",
    phoneRaw: "0800-1000-0004",
    rating: 4.3,
    reviewCount: 58,
    unitCount: 40,
    priceBand: "budget",
    priceNote: "Rp150rb–300rb / tenda",
    sourceLabel: "Direktori Bumi Perkemahan",
    hasWhatsapp: true,
    verified: false,
    lastSeenDays: 21,
    keywords: ["camping", "outbound", "sekolah"],
    notes: "Bumi perkemahan 40 lapak, langganan acara sekolah.",
  },
  {
    seq: 5,
    name: "Villa Sekar Maribaya",
    category: "villa",
    area: "lembang",
    address: "Jl. Maribaya No. 45, Lembang",
    phoneRaw: "0800-1000-0005",
    rating: 4.4,
    reviewCount: 63,
    unitCount: 6,
    priceBand: "mid",
    priceNote: "Rp500rb–900rb / malam",
    sourceLabel: "Marketplace Sewa Villa Jabar",
    hasWhatsapp: true,
    verified: false,
    lastSeenDays: 14,
    keywords: ["villa", "prewedding", "taman"],
    notes: "Villa taman 6 unit, sering dipakai prewedding.",
  },
  {
    seq: 6,
    name: "Homestay Pinus Lembang",
    category: "villa",
    area: "lembang",
    /* Alamat sengaja tanpa kata "hotel": `\bhotel\b` akan menyala pada
       "Jl. Grand Hotel" dan menghasilkan alasan kategori yang menyesatkan. */
    address: "Jl. Kayuambon No. 9, Lembang",
    phoneRaw: "0800-1000-0006",
    rating: 4.2,
    reviewCount: 47,
    unitCount: 10,
    priceBand: "budget",
    priceNote: "Rp250rb–450rb / malam",
    sourceLabel: "Direktori Villa Bandung Raya",
    hasWhatsapp: true,
    verified: true,
    lastSeenDays: 11,
    keywords: ["homestay", "backpacker", "murah"],
    notes: "10 kamar homestay di tengah hutan pinus.",
  },
  {
    seq: 7,
    name: "Villa Situ Cileunca Asri",
    category: "villa",
    area: "pangalengan",
    address: "Jl. Situ Cileunca No. 20, Pangalengan",
    phoneRaw: "0800-1000-0007",
    rating: 4.6,
    reviewCount: 118,
    unitCount: 12,
    priceBand: "mid",
    priceNote: "Rp500rb–900rb / malam",
    sourceLabel: "Direktori Villa Bandung Raya",
    hasWhatsapp: true,
    verified: true,
    lastSeenDays: 5,
    keywords: ["villa", "danau", "rombongan"],
    notes: "12 unit tepi Situ Cileunca, dermaga pribadi.",
  },
  {
    seq: 8,
    name: "Glamping Kebun Teh Malabar",
    category: "glamping",
    area: "pangalengan",
    address: "Perkebunan Malabar Blok C, Pangalengan",
    phoneRaw: "0800-1000-0008",
    rating: 4.7,
    reviewCount: 203,
    unitCount: 12,
    priceBand: "premium",
    priceNote: "Rp1,2jt–2,4jt / tenda",
    sourceLabel: "Listing Komunitas Glamping Jabar",
    hasWhatsapp: true,
    verified: true,
    lastSeenDays: 3,
    keywords: ["glamping", "kebun teh", "honeymoon"],
    notes: "Glamping premium di kebun teh Malabar.",
  },
  {
    seq: 9,
    name: "Camping Ground Tepi Danau Cileunca",
    category: "camping",
    area: "pangalengan",
    address: "Jl. Warnasari, Tepi Situ Cileunca, Pangalengan",
    phoneRaw: "0800-1000-0009",
    rating: 4.4,
    reviewCount: 76,
    unitCount: 35,
    priceBand: "budget",
    priceNote: "Rp150rb–300rb / tenda",
    sourceLabel: "Direktori Bumi Perkemahan",
    hasWhatsapp: true,
    verified: false,
    lastSeenDays: 17,
    keywords: ["camping", "danau", "perahu"],
    notes: "35 lapak tenda tepi danau, sewa perahu.",
  },
  {
    seq: 10,
    name: "Villa Puncak Malabar",
    category: "villa",
    area: "pangalengan",
    address: "Jl. Raya Malabar KM 4, Pangalengan",
    phoneRaw: "0800-1000-0010",
    rating: 4.3,
    reviewCount: 54,
    unitCount: 9,
    priceBand: "mid",
    priceNote: "Rp500rb–900rb / malam",
    sourceLabel: "Marketplace Sewa Villa Jabar",
    hasWhatsapp: false,
    verified: true,
    lastSeenDays: 28,
    keywords: ["villa", "keluarga", "perapian"],
    notes: "9 unit villa kayu, tiap unit ada perapian.",
  },
  {
    seq: 11,
    name: "Pondok Wisata Cibolang",
    category: "villa",
    area: "pangalengan",
    address: "Jl. Pemandian Air Panas Cibolang, Pangalengan",
    phoneRaw: "0800-1000-0011",
    rating: 4.1,
    reviewCount: 39,
    unitCount: 5,
    priceBand: "budget",
    priceNote: "Rp250rb–450rb / malam",
    sourceLabel: "Katalog Wisata Jawa Barat",
    hasWhatsapp: true,
    verified: false,
    lastSeenDays: 33,
    keywords: ["pondok", "air panas", "keluarga"],
    notes: "5 pondok dekat pemandian air panas Cibolang.",
  },
  {
    seq: 12,
    name: "Villa Kawah Putih Residence",
    category: "villa",
    area: "ciwidey",
    address: "Jl. Raya Ciwidey-Patengan KM 9, Ciwidey",
    phoneRaw: "0800-1000-0012",
    rating: 4.5,
    reviewCount: 97,
    unitCount: 11,
    priceBand: "mid",
    priceNote: "Rp500rb–900rb / malam",
    sourceLabel: "Direktori Villa Bandung Raya",
    hasWhatsapp: true,
    verified: true,
    lastSeenDays: 7,
    keywords: ["villa", "kawah putih", "rombongan"],
    notes: "11 unit, 15 menit dari Kawah Putih.",
  },
  {
    seq: 13,
    name: "Glamping Ranca Upas Pinus",
    category: "glamping",
    area: "ciwidey",
    address: "Kawasan Ranca Upas, Jl. Raya Ciwidey KM 11",
    phoneRaw: "0800-1000-0013",
    rating: 4.6,
    reviewCount: 167,
    unitCount: 26,
    priceBand: "premium",
    priceNote: "Rp1,2jt–2,4jt / tenda",
    sourceLabel: "Listing Komunitas Glamping Jabar",
    hasWhatsapp: true,
    verified: true,
    lastSeenDays: 2,
    keywords: ["glamping", "pinus", "rusa"],
    notes: "26 tenda di hutan pinus Ranca Upas.",
  },
  {
    seq: 14,
    name: "Resort Situ Patenggang Indah",
    category: "villa",
    area: "ciwidey",
    address: "Jl. Situ Patenggang, Rancabali, Ciwidey",
    phoneRaw: "0800-1000-0014",
    rating: 4.8,
    reviewCount: 241,
    unitCount: 12,
    priceBand: "premium",
    priceNote: "Rp1,2jt–2,4jt / malam",
    sourceLabel: "Direktori Villa Bandung Raya",
    hasWhatsapp: true,
    verified: true,
    lastSeenDays: 34,
    keywords: ["resort", "danau", "meeting room"],
    notes: "Resort 12 unit dengan meeting room 80 pax.",
  },
  {
    seq: 15,
    name: "Ranca Upas Camping Ground",
    category: "camping",
    area: "ciwidey",
    address: "Jl. Raya Ranca Upas KM 11, Ciwidey",
    phoneRaw: "0800-1000-0015",
    rating: 4.5,
    reviewCount: 312,
    unitCount: 60,
    priceBand: "budget",
    priceNote: "Rp150rb–300rb / tenda",
    sourceLabel: "Direktori Bumi Perkemahan",
    hasWhatsapp: true,
    verified: true,
    lastSeenDays: 8,
    keywords: ["camping", "outbound", "rusa"],
    notes: "60 lapak tenda, area rusa, paket outbound.",
  },
  {
    seq: 16,
    name: "Villa Strawberry Ciwidey",
    category: "villa",
    area: "ciwidey",
    address: "Jl. Raya Ciwidey No. 88, Ciwidey",
    phoneRaw: "0800-1000-0016",
    rating: 4.2,
    reviewCount: 44,
    unitCount: 7,
    priceBand: "budget",
    priceNote: "Rp250rb–450rb / malam",
    sourceLabel: "Marketplace Sewa Villa Jabar",
    hasWhatsapp: true,
    verified: false,
    lastSeenDays: 19,
    keywords: ["villa", "kebun strawberry", "murah"],
    notes: "7 unit di tengah kebun strawberry.",
  },
  {
    seq: 17,
    name: "Villa Dago Pakar Atas",
    category: "villa",
    area: "dago",
    address: "Jl. Dago Pakar Utara No. 17, Bandung",
    phoneRaw: "0800-1000-0017",
    rating: 4.6,
    reviewCount: 129,
    unitCount: 13,
    priceBand: "premium",
    priceNote: "Rp1,2jt–2,4jt / malam",
    sourceLabel: "Direktori Villa Bandung Raya",
    hasWhatsapp: true,
    verified: true,
    lastSeenDays: 6,
    keywords: ["villa", "city view", "private pool"],
    notes: "13 unit private pool, city view Bandung.",
  },
  {
    seq: 18,
    name: "Villa Bukit Pakar Timur",
    category: "villa",
    area: "dago",
    address: "Jl. Bukit Pakar Timur No. 4, Bandung",
    phoneRaw: "0800-1000-0018",
    rating: 4.4,
    reviewCount: 71,
    unitCount: 9,
    priceBand: "mid",
    priceNote: "Rp500rb–900rb / malam",
    sourceLabel: "Marketplace Sewa Villa Jabar",
    hasWhatsapp: true,
    verified: true,
    lastSeenDays: 12,
    keywords: ["villa", "keluarga", "city view"],
    notes: "9 unit di Bukit Pakar, cocok keluarga besar.",
  },
  {
    seq: 19,
    name: "Glamping Dago Giri",
    category: "glamping",
    area: "dago",
    address: "Jl. Dago Giri KM 2,5, Bandung",
    phoneRaw: "0800-1000-0019",
    rating: 4.5,
    reviewCount: 88,
    unitCount: 15,
    priceBand: "premium",
    priceNote: "Rp1,2jt–2,4jt / tenda",
    sourceLabel: "Listing Komunitas Glamping Jabar",
    hasWhatsapp: true,
    verified: false,
    lastSeenDays: 10,
    keywords: ["glamping", "kabut", "cafe"],
    notes: "15 tenda glamping di Dago Giri.",
  },
  {
    seq: 20,
    name: "Pengelola Unit Harian Dago Atas",
    category: "villa",
    area: "dago",
    address: "Jl. Dago Asri Blok B, Bandung",
    phoneRaw: "0800-1000-0020",
    rating: 4.0,
    reviewCount: 26,
    unitCount: 24,
    priceBand: "mid",
    priceNote: "Rp500rb–900rb / malam",
    sourceLabel: "Katalog Wisata Jawa Barat",
    hasWhatsapp: true,
    verified: false,
    lastSeenDays: 15,
    keywords: ["pengelola", "sewa harian", "banyak unit"],
    notes: "Mengelola 24 unit sewa harian di Dago Atas.",
  },
  {
    seq: 21,
    name: "Kemah Keluarga Dago Pakar",
    category: "camping",
    area: "dago",
    address: "Jl. Dago Pakar Timur, Mekarsaluyu, Bandung",
    phoneRaw: "0800-1000-0021",
    rating: 3.9,
    reviewCount: 18,
    unitCount: 20,
    priceBand: "budget",
    priceNote: "Rp150rb–300rb / tenda",
    sourceLabel: "Direktori Bumi Perkemahan",
    hasWhatsapp: false,
    verified: false,
    lastSeenDays: 41,
    keywords: ["camping", "keluarga", "dekat kota"],
    notes: "20 lapak tenda keluarga di Dago Pakar.",
  },
  {
    seq: 22,
    name: "Villa Cisarua Hijau",
    category: "villa",
    area: "cisarua",
    address: "Jl. Kolonel Masturi No. 240, Cisarua",
    phoneRaw: "0800-1000-0022",
    rating: 4.3,
    reviewCount: 66,
    unitCount: 8,
    priceBand: "mid",
    priceNote: "Rp500rb–900rb / malam",
    sourceLabel: "Direktori Villa Bandung Raya",
    hasWhatsapp: true,
    verified: true,
    lastSeenDays: 13,
    keywords: ["villa", "sejuk", "rombongan"],
    notes: "8 unit di jalur Kolonel Masturi.",
  },
  {
    seq: 23,
    name: "Glamping Curug Cimahi View",
    category: "glamping",
    area: "cisarua",
    address: "Jl. Kolonel Masturi KM 7, Cisarua",
    phoneRaw: "0800-1000-0023",
    rating: 4.4,
    reviewCount: 82,
    unitCount: 16,
    priceBand: "mid",
    priceNote: "Rp600rb–1jt / tenda",
    sourceLabel: "Listing Komunitas Glamping Jabar",
    hasWhatsapp: true,
    verified: false,
    lastSeenDays: 9,
    keywords: ["glamping", "curug", "foto"],
    notes: "16 tenda dengan view Curug Cimahi.",
  },
  {
    seq: 24,
    name: "Kampung Perkemahan Barubereum",
    category: "camping",
    area: "cisarua",
    address: "Jl. Barubereum, Kertawangi, Cisarua",
    phoneRaw: "0800-1000-0024",
    rating: 4.2,
    reviewCount: 51,
    unitCount: 45,
    priceBand: "budget",
    priceNote: "Rp150rb–300rb / tenda",
    sourceLabel: "Direktori Bumi Perkemahan",
    hasWhatsapp: true,
    verified: false,
    lastSeenDays: 24,
    keywords: ["camping", "pramuka", "lapangan luas"],
    notes: "45 lapak, lapangan upacara, langganan pramuka.",
  },
];

/** Listing palsu memakai TLD `.example` (RFC 2606) — tidak pernah bisa resolve. */
export function listingUrl(row: {
  seq: number;
  name: string;
  sourceLabel: string;
}): string {
  return `https://${slug(row.sourceLabel)}.example/l/${row.seq}-${slug(row.name)}`;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ── Skor prospek ─────────────────────────────────────────────────────────── */

/**
 * Skor **tidak tergantung kueri pencarian**. Prospek yang skornya berubah
 * antara dua pencarian terbaca seperti bug. Relevansi terhadap kueri adalah
 * `matchScore` yang terpisah dan hanya memengaruhi urutan.
 */
export const SCORE_WEIGHTS = {
  rating: 25,
  reviews: 20,
  scale: 20,
  price: 15,
  whatsapp: 10,
  verified: 5,
  freshness: 5,
} as const;

export const SCORE_TIERS = [
  { min: 80, label: "prioritas tinggi" },
  { min: 60, label: "layak dihubungi" },
  { min: 40, label: "cadangan" },
  { min: 0, label: "lewati dulu" },
] as const;

export type ScorePart = {
  key: keyof typeof SCORE_WEIGHTS;
  label: string;
  points: number;
  max: number;
};

const PART_LABELS: Record<keyof typeof SCORE_WEIGHTS, string> = {
  rating: "Rating",
  reviews: "Jumlah ulasan",
  scale: "Skala usaha",
  price: "Kelas harga",
  whatsapp: "Kanal WhatsApp",
  verified: "Listing terverifikasi",
  freshness: "Kesegaran listing",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Dibulatkan 2 desimal sebelum dijumlah supaya `scoreParts` sama di kedua sisi. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type ScorableProspect = {
  category: ProspectCategory;
  rating: number;
  reviewCount: number;
  unitCount: number;
  priceBand: PriceBand;
  hasWhatsapp: boolean;
  verified: boolean;
  lastSeenDays: number;
};

export function scoreProspect(row: ScorableProspect): {
  score: number;
  parts: ScorePart[];
} {
  const rating = round2(
    clamp((Number(row.rating) - 3.5) / 1.2, 0, 1) * SCORE_WEIGHTS.rating,
  );

  const rev = Number(row.reviewCount) || 0;
  const reviews =
    rev >= 200
      ? 20
      : rev >= 100
        ? 16
        : rev >= 50
          ? 12
          : rev >= 20
            ? 8
            : rev >= 5
              ? 4
              : 0;

  const units = Number(row.unitCount) || 0;
  const scale =
    units >= 15
      ? 20
      : units >= 8
        ? 15
        : units >= 4
          ? 10
          : units >= 2
            ? 6
            : units >= 1
              ? 2
              : 0;

  const price =
    row.priceBand === "premium"
      ? 15
      : row.priceBand === "mid"
        ? 11
        : row.priceBand === "budget"
          ? 5
          : 0;

  const whatsapp = row.hasWhatsapp === true ? SCORE_WEIGHTS.whatsapp : 0;
  const verified = row.verified === true ? SCORE_WEIGHTS.verified : 0;

  const days = Number(row.lastSeenDays) || 0;
  const freshness = days <= 7 ? 5 : days <= 30 ? 3 : days <= 90 ? 1 : 0;

  const raw = { rating, reviews, scale, price, whatsapp, verified, freshness };
  const parts = (
    Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[]
  ).map((key) => ({
    key,
    label: PART_LABELS[key],
    points: raw[key],
    max: SCORE_WEIGHTS[key],
  }));

  const total = parts.reduce((sum, part) => sum + part.points, 0);
  return { score: clamp(Math.round(total), 0, 100), parts };
}

export function scoreTier(score: number): string {
  for (const tier of SCORE_TIERS) {
    if (score >= tier.min) return tier.label;
  }
  return SCORE_TIERS[SCORE_TIERS.length - 1].label;
}

/** `4.7` → `"4,7"`. Angka desimal di layar berbahasa Indonesia pakai koma. */
function idDecimal(value: number): string {
  return String(value).replace(".", ",");
}

function relativeDays(days: number): string {
  if (days <= 0) return "hari ini";
  if (days === 1) return "kemarin";
  if (days < 30) return `${days} hari lalu`;
  if (days < 365) return `${Math.floor(days / 30)} bulan lalu`;
  return `${Math.floor(days / 365)} tahun lalu`;
}

/**
 * Alasan skor mengikuti tata bahasa `classify_reason` milik backend: klausa
 * dipisah koma, lalu vonis setelah tanda pisah. Hanya sinyal yang benar-benar
 * menyumbang poin yang disebut — itulah yang membedakannya dari template yang
 * diisi buta.
 */
export function scoreReason(
  row: ProspectSeed,
  score: number,
  options: { existingLeadId?: string } = {},
): string {
  const clauses: string[] = [];

  if (options.existingLeadId) {
    clauses.push(`Sudah ada di CRM sebagai lead #${options.existingLeadId}`);
  }

  clauses.push(
    row.reviewCount < 5
      ? `Rating ${idDecimal(row.rating)}, ulasan masih sedikit`
      : `Rating ${idDecimal(row.rating)} dari ${row.reviewCount} ulasan`,
  );

  if (row.unitCount > 0) {
    clauses.push(`${row.unitCount} ${UNIT_WORDS[row.category]}`);
  }
  clauses.push(PRICE_BAND_LABELS[row.priceBand]);
  if (row.hasWhatsapp) clauses.push("nomor WhatsApp aktif");
  if (row.verified) clauses.push("listing terverifikasi");
  if (row.lastSeenDays <= 90) {
    clauses.push(`listing diperbarui ${relativeDays(row.lastSeenDays)}`);
  }

  const verdict = options.existingLeadId ? "duplikat" : scoreTier(score);
  return `${clauses.join(", ")} — skor ${score}/100, ${verdict}`;
}

/* ── Waktu ────────────────────────────────────────────────────────────────── */

export const STALE_DAYS = 3;

const DAY_MS = 86_400_000;

export function daysSinceIso(iso: string, now: number = Date.now()): number {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Math.floor((now - ts) / DAY_MS));
}

/**
 * Jam WIB dihitung dari epoch, **bukan** `new Date().getHours()`. Server bisa
 * berjalan di UTC, dan `timezone: "Asia/Jakarta"` milik workflow n8n tidak
 * memengaruhi `new Date()` di dalam Code node. Salah di sini menghasilkan
 * "Selamat pagi" pukul sembilan malam di salah satu dari dua mode.
 */
export function wibHour(now: number = Date.now()): number {
  return Math.floor((now / 3_600_000 + 7) % 24);
}

export function greeting(now: number = Date.now()): string {
  const hour = wibHour(now);
  if (hour < 11) return "pagi";
  if (hour < 15) return "siang";
  if (hour < 18) return "sore";
  return "malam";
}

/* ── Template pesan WhatsApp ──────────────────────────────────────────────── */

export const BRAND = "WithMi";
export const PRODUK = "perlengkapan harian";

export type FollowupGoal =
  | "perkenalan"
  | "tindak_lanjut_penawaran"
  | "repeat_order"
  | "reaktivasi";

export const GOAL_LABELS: Record<FollowupGoal, string> = {
  perkenalan: "Perkenalan",
  tindak_lanjut_penawaran: "Tindak lanjut penawaran",
  repeat_order: "Repeat order",
  reaktivasi: "Reaktivasi",
};

export const TEMPLATE_IDS: Record<FollowupGoal, string> = {
  perkenalan: "wa_perkenalan_v1",
  tindak_lanjut_penawaran: "wa_tindak_lanjut_penawaran_v1",
  repeat_order: "wa_repeat_order_v1",
  reaktivasi: "wa_reaktivasi_v1",
};

/** Batas aman untuk `wa.me/?text=` dan untuk kolom `content` di activity. */
const MAX_DRAFT_CHARS = 600;

export type DraftVars = {
  waktu: string;
  sapaan: string;
  sales: string;
  nama: string;
  alamat: string;
  jeda_hari: number;
  jumlah_order: string;
  lama_penawaran: string;
};

/** B2B disapa sebagai tim; B2C disapa personal dengan nama depan. */
function sapaan(lead: Pick<Lead, "name" | "type">): string {
  if (lead.type === "B2B") return `tim ${lead.name}`;
  const first =
    String(lead.name || "")
      .trim()
      .split(/\s+/)[0] || "Kak";
  return `Kak ${first}`;
}

function relativeShort(iso: string, now: number): string {
  const days = daysSinceIso(iso, now);
  if (days === 0) return "hari ini";
  if (days === 1) return "kemarin";
  if (days < 30) return `${days} hari lalu`;
  if (days < 365) return `${Math.floor(days / 30)} bulan lalu`;
  return `${Math.floor(days / 365)} tahun lalu`;
}

function body(goal: FollowupGoal, v: DraftVars): string {
  // Lead tanpa sales memang ada di data (kasus "belum ditugaskan"), dan
  // menambal namanya dengan frasa umum menghasilkan "Saya tim sales kami dari
  // WithMi". Kalimat pembukanya yang menyesuaikan, bukan namanya yang dipaksa.
  const pembuka = v.sales
    ? `Selamat ${v.waktu}, ${v.sapaan}. Saya ${v.sales} dari ${BRAND}.`
    : `Selamat ${v.waktu}, ${v.sapaan}. Saya dari tim ${BRAND}.`;

  if (goal === "perkenalan") {
    return [
      pembuka,
      `Kami lihat ${v.nama}${v.alamat ? ` di ${v.alamat}` : ""} — kami menyediakan ${PRODUK} untuk kebutuhan villa, glamping, dan camping ground.`,
      "Boleh saya kirimkan katalog dan harga khusus pengelola? Kalau berkenan, saya kirim sekarang juga.",
    ].join("\n");
  }

  if (goal === "tindak_lanjut_penawaran") {
    return [
      pembuka,
      `Penawaran yang saya kirim ${v.lama_penawaran} sudah sempat dilihat? Kalau ada yang perlu disesuaikan — jumlah, warna, atau waktu kirim — saya bantu revisi hari ini juga.`,
      "Balas pesan ini saja kalau ada yang mau ditanyakan.",
    ].join("\n");
  }

  if (goal === "repeat_order") {
    return [
      pembuka,
      `Terima kasih untuk ${v.jumlah_order} pesanan sebelumnya. Stok untuk restock bulan ini sudah siap, dan untuk pelanggan lama ada harga khusus.`,
      "Mau saya siapkan pesanan dengan jumlah yang sama seperti terakhir?",
    ].join("\n");
  }

  return [
    pembuka,
    `Saya cek catatan kami, obrolan terakhir kita ${v.jeda_hari} hari lalu dan belum sempat dilanjutkan. Masih ada rencana untuk melanjutkan penawaran kemarin?`,
    'Kalau sekarang belum sempat, saya kabari lagi minggu depan — tinggal balas "nanti saja".',
  ].join("\n");
}

/**
 * Urutan ini yang menentukan kalimat mana yang dipakai, dan urutannya
 * disebutkan apa adanya di `reason` supaya pilihan template bisa dibantah.
 */
export function pickGoal(lead: Lead, now: number = Date.now()): FollowupGoal {
  const days = daysSinceIso(lead.last_activity_at || lead.created_at, now);
  if (lead.stage === "in_progress" && days >= 7) return "reaktivasi";
  if (lead.order_count > 0) return "repeat_order";
  if (lead.stage === "in_progress") return "tindak_lanjut_penawaran";
  return "perkenalan";
}

export type Draft = {
  templateId: string;
  goal: FollowupGoal;
  goalLabel: string;
  channel: "wa";
  text: string;
  reason: string;
  vars: DraftVars;
};

export function renderDraft(
  lead: Lead,
  goal: FollowupGoal,
  now: number = Date.now(),
): Draft {
  const days = daysSinceIso(lead.last_activity_at || lead.created_at, now);
  const vars: DraftVars = {
    waktu: greeting(now),
    sapaan: sapaan(lead),
    sales: lead.owner_name,
    nama: lead.name,
    alamat: lead.address,
    jeda_hari: days,
    jumlah_order: `${lead.order_count}x`,
    lama_penawaran: relativeShort(
      lead.last_activity_at || lead.created_at,
      now,
    ),
  };

  let text = body(goal, vars);
  if (text.length > MAX_DRAFT_CHARS) {
    text = `${text.slice(0, MAX_DRAFT_CHARS - 1)}…`;
  }

  return {
    templateId: TEMPLATE_IDS[goal],
    goal,
    goalLabel: GOAL_LABELS[goal],
    channel: "wa",
    text,
    reason: draftReason(lead, goal, days),
    vars,
  };
}

function draftReason(lead: Lead, goal: FollowupGoal, days: number): string {
  const clauses = [`Lead ada di ${stageLabel(lead.stage)}`];
  clauses.push(
    days === 0 ? "ada aktivitas hari ini" : `${days} hari tanpa aktivitas`,
  );
  clauses.push(
    lead.order_count > 0
      ? `sudah ${lead.order_count}x order`
      : "belum pernah order",
  );

  const auto = pickGoal(lead, Date.now());
  const tail =
    goal === auto
      ? `dipakai template ${GOAL_LABELS[goal].toLowerCase()}`
      : `template ${GOAL_LABELS[goal].toLowerCase()} dipilih manual, bukan ${GOAL_LABELS[auto].toLowerCase()}`;

  return `${clauses.join(", ")} — ${tail}`;
}

/* ── Antrian usulan ───────────────────────────────────────────────────────── */

export type AiTaskKind = "prospect_batch" | "followup" | "stage_move";
export type AiTaskStatus = "pending" | "approved" | "rejected" | "failed";

export const TASK_KIND_LABELS: Record<AiTaskKind, string> = {
  prospect_batch: "Tambah prospek ke CRM",
  followup: "Kirim follow-up",
  stage_move: "Pindahkan stage",
};

/** Baris `crm_prospects` setelah dinormalkan, siap dinilai dan ditampilkan. */
export type ProspectRow = ProspectSeed & {
  id: string;
  phone: string;
  status: ProspectStatus;
  convertedLeadId: string;
};

export type PlannedTask = {
  kind: AiTaskKind;
  title: string;
  reason: string;
  priority: number;
  leadId: string;
  leadName: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
};

export type ExistingTask = {
  dedupe_key: string;
  status: AiTaskStatus;
  decided_at: string;
};

export function dedupeKeyFor(
  kind: AiTaskKind,
  parts: { leadId?: string; stage?: string; prospectIds?: string[] },
): string {
  if (kind === "followup") return `followup:${parts.leadId ?? ""}`;
  if (kind === "stage_move") {
    return `stage_move:${parts.leadId ?? ""}:${parts.stage ?? ""}`;
  }
  const ids = [...(parts.prospectIds ?? [])].sort(
    (a, b) => Number(a) - Number(b),
  );
  return `prospect_batch:${ids.join("-")}`;
}

/** Kata yang menandakan transaksi sudah bergerak, dicari di isi activity. */
const CLOSING_HINTS = /(transfer|dp|lunas|closing|invoice)/i;
const CONTACT_TYPES = new Set(["call", "wa", "visit"]);

export type GenerateInput = {
  leads: Lead[];
  activities: Activity[];
  prospects: ProspectRow[];
  existingTasks: ExistingTask[];
  kinds?: AiTaskKind[];
  now?: number;
};

export type GenerateOutput = {
  tasks: PlannedTask[];
  skipped: { dedupeKey: string; reason: string }[];
};

const LIMITS: Record<AiTaskKind, number> = {
  followup: 6,
  stage_move: 4,
  prospect_batch: 1,
};

export function generateTasks(input: GenerateInput): GenerateOutput {
  const now = input.now ?? Date.now();
  const wanted = new Set<AiTaskKind>(
    input.kinds?.length
      ? input.kinds
      : ["followup", "stage_move", "prospect_batch"],
  );

  const byLead = new Map<string, Activity[]>();
  for (const activity of input.activities) {
    const list = byLead.get(activity.lead_id);
    if (list) list.push(activity);
    else byLead.set(activity.lead_id, [activity]);
  }

  const tasks: PlannedTask[] = [];
  if (wanted.has("followup")) tasks.push(...planFollowups(input.leads, now));
  if (wanted.has("stage_move")) {
    tasks.push(...planStageMoves(input.leads, byLead, now));
  }
  if (wanted.has("prospect_batch")) {
    tasks.push(...planProspectBatch(input.prospects));
  }

  return applyDedupe(tasks, input.existingTasks, now);
}

function planFollowups(leads: Lead[], now: number): PlannedTask[] {
  const out: PlannedTask[] = [];

  for (const lead of leads) {
    if (lead.stage !== "todo" && lead.stage !== "in_progress") continue;

    const days = daysSinceIso(lead.last_activity_at || lead.created_at, now);
    // `is_stale` hanya ditulis CRM Stale Detector pukul 08:00 WIB, jadi lead
    // yang baru saja menjadi basi masih berbendera false. Hari dihitung
    // sendiri supaya antrian tidak kosong waktu demo jam satu siang.
    if (!lead.is_stale && days < STALE_DAYS) continue;

    const goal = pickGoal(lead, now);
    const draft = renderDraft(lead, goal, now);

    out.push({
      kind: "followup",
      title: `Follow up ${lead.name} — ${days} hari tanpa aktivitas`,
      reason: draft.reason,
      priority: Math.min(
        100,
        40 +
          days * 6 +
          (lead.order_count > 0 ? 10 : 0) +
          (lead.type === "B2B" ? 10 : 0),
      ),
      leadId: lead.id,
      leadName: lead.name,
      payload: {
        leadId: lead.id,
        goal,
        templateId: draft.templateId,
        text: draft.text,
        channel: "wa",
        vars: draft.vars,
      },
      dedupeKey: dedupeKeyFor("followup", { leadId: lead.id }),
    });
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, LIMITS.followup);
}

function planStageMoves(
  leads: Lead[],
  byLead: Map<string, Activity[]>,
  now: number,
): PlannedTask[] {
  const out: PlannedTask[] = [];

  for (const lead of leads) {
    if (lead.stage === "won" || lead.stage === "lost") continue;

    const acts = (byLead.get(lead.id) ?? [])
      .slice()
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const contacts = acts.filter((a) => CONTACT_TYPES.has(a.type));
    const days = daysSinceIso(lead.last_activity_at || lead.created_at, now);

    const move = pickStageMove(lead, acts, contacts, days, now);
    if (!move) continue;

    out.push({
      kind: "stage_move",
      title: `Pindahkan ${lead.name} ke ${stageLabel(move.to)}`,
      reason: move.reason,
      priority: move.priority,
      leadId: lead.id,
      leadName: lead.name,
      payload: {
        leadId: lead.id,
        from: lead.stage,
        to: move.to,
        note: move.note,
        evidence: {
          contactCount: contacts.length,
          lastType: contacts[0]?.type ?? "",
          lastAt: contacts[0]?.created_at ?? "",
          idleDays: days,
        },
      },
      dedupeKey: dedupeKeyFor("stage_move", {
        leadId: lead.id,
        stage: move.to,
      }),
    });
  }

  return out
    .sort((a, b) => b.priority - a.priority)
    .slice(0, LIMITS.stage_move);
}

function pickStageMove(
  lead: Lead,
  acts: Activity[],
  contacts: Activity[],
  days: number,
  now: number,
): { to: Stage; reason: string; note: string; priority: number } | null {
  // S1 — sudah ada interaksi tapi kartunya masih menganggur di To Do.
  if (lead.stage === "todo" && contacts.length >= 1) {
    const last = contacts[0];
    return {
      to: "in_progress",
      priority: 70,
      note: "Dipindahkan atas usulan agen",
      reason: `Sudah ada ${contacts.length} interaksi (terakhir ${activityWord(last.type)} ${relativeShort(last.created_at, now)}) tapi kartu masih di To Do — disarankan pindah ke In Progress`,
    };
  }

  if (lead.stage === "in_progress") {
    // S2 — satu-satunya aturan yang membaca isi catatan. Sengaja dibuat
    // terlihat: potongan kalimatnya ikut dikutip di alasan, supaya operator
    // bisa menilai sendiri apakah tebakannya masuk akal.
    const hint = acts.find((a) => CLOSING_HINTS.test(a.content));
    if (lead.order_count >= 1 && hint) {
      return {
        to: "won",
        priority: 80,
        note: "Ditandai Win atas usulan agen",
        reason: `Ada catatan "${excerpt(hint.content)}" dan ${lead.order_count}x order tercatat — disarankan ditandai Win`,
      };
    }

    // S3 — usulan yang merusak. Justru ini alasan antrian approval ada:
    // menutup lead orang lain tidak boleh terjadi tanpa tanda tangan manusia.
    if (days >= 14) {
      return {
        to: "lost",
        priority: 55,
        note: "Ditutup atas usulan agen",
        reason: `${days} hari tanpa respons setelah ${contacts.length} percobaan kontak — disarankan ditutup sebagai Fail`,
      };
    }
  }

  return null;
}

function planProspectBatch(prospects: ProspectRow[]): PlannedTask[] {
  const ready = prospects
    .filter((p) => p.status === "new" && scoreProspect(p).score >= 70)
    .sort((a, b) => scoreProspect(b).score - scoreProspect(a).score)
    .slice(0, 8);

  if (ready.length < 3) return [];

  const scores = ready.map((p) => scoreProspect(p).score);
  const avgScore = Math.round(
    scores.reduce((a, b) => a + b, 0) / scores.length,
  );
  const avgRating = ready.reduce((sum, p) => sum + p.rating, 0) / ready.length;

  const areas = unique(ready.map((p) => AREA_LABELS[p.area]));
  const dominant = mostCommon(ready.map((p) => p.category));
  const eligible = prospects.filter((p) => p.status === "new").length;

  return [
    {
      kind: "prospect_batch",
      title: `Tambahkan ${ready.length} prospek ${CATEGORY_LABELS[dominant].toLowerCase()} area ${listAnd(areas)} ke CRM`,
      reason: `${ready.length} dari ${eligible} prospek berskor ≥70 dan nomornya belum ada di CRM, rata-rata rating ${idDecimal(Math.round(avgRating * 10) / 10)} — siap dimasukkan sebagai lead baru`,
      priority: avgScore,
      leadId: "",
      leadName: "",
      payload: {
        prospectIds: ready.map((p) => p.id),
        source: "auto",
        areaMix: unique(ready.map((p) => p.area)),
      },
      dedupeKey: dedupeKeyFor("prospect_batch", {
        prospectIds: ready.map((p) => p.id),
      }),
    },
  ];
}

/**
 * Usulan yang sama tidak diantrikan dua kali, dan yang baru saja disetujui
 * tidak langsung muncul lagi. Akibatnya klik "Cari usulan" yang kedua memang
 * mengembalikan nol — UI harus menyatakan itu, bukan diam saja.
 */
function applyDedupe(
  tasks: PlannedTask[],
  existing: ExistingTask[],
  now: number,
): GenerateOutput {
  const pending = new Set<string>();
  const recentlyApproved = new Set<string>();

  for (const row of existing) {
    if (row.status === "pending") {
      pending.add(row.dedupe_key);
      continue;
    }
    if (row.status !== "approved") continue;
    const decided = Date.parse(row.decided_at);
    if (!Number.isNaN(decided) && now - decided < DAY_MS) {
      recentlyApproved.add(row.dedupe_key);
    }
  }

  const kept: PlannedTask[] = [];
  const skipped: { dedupeKey: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const task of tasks) {
    if (seen.has(task.dedupeKey)) continue;
    seen.add(task.dedupeKey);

    if (pending.has(task.dedupeKey)) {
      skipped.push({
        dedupeKey: task.dedupeKey,
        reason: "Sudah ada tugas pending yang sama",
      });
      continue;
    }
    if (recentlyApproved.has(task.dedupeKey)) {
      skipped.push({
        dedupeKey: task.dedupeKey,
        reason: "Baru disetujui kurang dari 24 jam lalu",
      });
      continue;
    }
    kept.push(task);
  }

  return { tasks: kept, skipped };
}

/* ── Serpihan ─────────────────────────────────────────────────────────────── */

const ACTIVITY_WORDS: Record<string, string> = {
  call: "telepon",
  wa: "WhatsApp",
  visit: "kunjungan",
  note: "catatan",
  stage_change: "perpindahan stage",
  assign: "pergantian sales",
  created: "pembuatan lead",
};

function activityWord(type: string): string {
  return ACTIVITY_WORDS[type] ?? type;
}

function excerpt(value: string, max = 48): string {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function mostCommon<T>(values: T[]): T {
  const tally = new Map<T, number>();
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function listAnd(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} dan ${values[values.length - 1]}`;
}

/* ── Bentuk kandidat yang dikirim ke dashboard ────────────────────────────── */

export type ProspectCandidate = {
  prospectId: string;
  name: string;
  category: ProspectCategory;
  categoryLabel: string;
  area: ProspectArea;
  areaLabel: string;
  address: string;
  phone: string;
  phoneRaw: string;
  rating: number;
  reviewCount: number;
  unitCount: number;
  unitLabel: string;
  priceBand: PriceBand;
  priceNote: string;
  sourceLabel: string;
  listingUrl: string;
  hasWhatsapp: boolean;
  verified: boolean;
  lastSeenAt: string;
  lastSeenLabel: string;
  keywords: string[];
  notes: string;
  score: number;
  scoreTier: string;
  scoreReason: string;
  scoreParts: ScorePart[];
  matchScore: number;
  matchedOn: string[];
  status: ProspectStatus;
  alreadyInCrm: boolean;
  existingLeadId: string;
  leadDraft: {
    name: string;
    phone: string;
    address: string;
    source: string;
    notes: string;
  };
};

/** Seed → baris runtime. Dipakai mock, dan sekali untuk men-seed data table. */
export function seedToRow(seed: ProspectSeed, id: string): ProspectRow {
  return {
    ...seed,
    id,
    phone: normalizePhone(seed.phoneRaw),
    status: "new",
    convertedLeadId: "",
  };
}

/**
 * Catatan lead membawa asal-usul prospek, karena kolom `source` tidak bisa.
 * Ini satu-satunya jejak bahwa lead ini datang dari agen, jadi isinya harus
 * cukup untuk menjawab "dari mana angka ini?" tanpa membuka tab Agen AI.
 */
export function prospectNotes(row: ProspectRow, score: number): string {
  return `Prospek dari agen AI — ${row.sourceLabel}, rating ${idDecimal(row.rating)} (${row.reviewCount} ulasan), ${row.unitCount} ${UNIT_WORDS[row.category]}, skor ${score}/100.`;
}

export function toCandidate(
  row: ProspectRow,
  options: {
    now?: number;
    existingLeadId?: string;
    matchScore?: number;
    matchedOn?: string[];
  } = {},
): ProspectCandidate {
  const now = options.now ?? Date.now();
  const existingLeadId = options.existingLeadId ?? "";
  const { score, parts } = scoreProspect(row);

  return {
    prospectId: row.id,
    name: row.name,
    category: row.category,
    categoryLabel: CATEGORY_LABELS[row.category],
    area: row.area,
    areaLabel: AREA_LABELS[row.area],
    address: row.address,
    phone: row.phone,
    phoneRaw: row.phoneRaw,
    rating: row.rating,
    reviewCount: row.reviewCount,
    unitCount: row.unitCount,
    unitLabel: `${row.unitCount} ${UNIT_WORDS[row.category]}`,
    priceBand: row.priceBand,
    priceNote: row.priceNote,
    sourceLabel: row.sourceLabel,
    listingUrl: listingUrl(row),
    hasWhatsapp: row.hasWhatsapp,
    verified: row.verified,
    lastSeenAt: new Date(now - row.lastSeenDays * DAY_MS).toISOString(),
    lastSeenLabel: relativeDays(row.lastSeenDays),
    keywords: row.keywords,
    notes: row.notes,
    score,
    scoreTier: scoreTier(score),
    scoreReason: scoreReason(row, score, { existingLeadId }),
    scoreParts: parts,
    matchScore: options.matchScore ?? 0,
    matchedOn: options.matchedOn ?? [],
    status: row.status,
    alreadyInCrm: Boolean(existingLeadId),
    existingLeadId,
    leadDraft: {
      name: row.name,
      // Nomor dikirim dalam bentuk mentah supaya `phone_raw` di CRM terlihat
      // seperti hasil salin dari listing, bukan hasil olahan mesin.
      phone: row.phoneRaw,
      address: row.address,
      source: PROSPECT_LEAD_SOURCE,
      notes: prospectNotes(row, score),
    },
  };
}

/**
 * Relevansi terhadap kueri. Terpisah dari skor kualitas, dan hanya
 * memengaruhi urutan — prospek yang skornya berubah antara dua pencarian
 * terbaca seperti bug.
 */
export function matchProspect(
  row: ProspectRow,
  query: string,
): { matchScore: number; matchedOn: string[] } {
  const tokens = String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);

  if (!tokens.length) return { matchScore: 0, matchedOn: [] };

  let matchScore = 0;
  const matchedOn: string[] = [];
  const name = row.name.toLowerCase();
  const haystack = `${row.notes} ${row.address}`.toLowerCase();
  const keywords = row.keywords.map((k) => k.toLowerCase());

  for (const token of tokens) {
    if (name.includes(token)) {
      matchScore += 2;
      matchedOn.push("nama");
      continue;
    }
    const keyword = keywords.find((k) => k.includes(token));
    if (keyword) {
      matchScore += 1;
      matchedOn.push(`kata kunci: ${keyword}`);
      continue;
    }
    if (haystack.includes(token)) {
      matchScore += 1;
      matchedOn.push("deskripsi");
    }
  }

  return { matchScore, matchedOn: unique(matchedOn) };
}

/** Langkah yang ditampilkan sebagai stepper. Durasinya diukur, bukan dikarang. */
export type AgentStep = {
  key: string;
  label: string;
  detail: string;
  count: number | null;
  ms: number;
};
