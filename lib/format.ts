/** Nomor Indonesia dinormalkan ke bentuk 62xxxxxxxxxx. */
export function normalizePhone(input: string): string {
  const digits = (input ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

/**
 * `6287722863562` → `+62 877 2286 3562`.
 * Dipisah 3-4-sisa supaya blok depan (kode operator) selalu terbaca sama
 * lebarnya saat mata menyapu kolom.
 */
export function formatPhone(input: string): string {
  const digits = normalizePhone(input);
  if (!digits) return "—";
  if (!digits.startsWith("62")) return digits;

  const rest = digits.slice(2);
  if (rest.length <= 3) return `+62 ${rest}`;
  if (rest.length <= 7) return `+62 ${rest.slice(0, 3)} ${rest.slice(3)}`;
  return `+62 ${rest.slice(0, 3)} ${rest.slice(3, 7)} ${rest.slice(7)}`;
}

export function waLink(phone: string): string {
  return `https://wa.me/${normalizePhone(phone)}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Format relatif pendek berbahasa Indonesia. Sengaja tidak memakai
 * Intl.RelativeTimeFormat karena keluarannya ("2 hari yang lalu") terlalu
 * panjang untuk tabel dan kartu yang rapat.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";

  const diff = now - ts;
  if (diff < 0) return "baru saja";
  if (diff < MINUTE) return "baru saja";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} menit lalu`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} jam lalu`;

  const days = Math.floor(diff / DAY);
  if (days === 1) return "kemarin";
  if (days < 30) return `${days} hari lalu`;
  if (days < 365) return `${Math.floor(days / 30)} bulan lalu`;
  return `${Math.floor(days / 365)} tahun lalu`;
}

/** Selisih hari penuh, dipakai penanda stale di kartu. */
export function daysSince(iso: string, now: number = Date.now()): number {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Math.floor((now - ts) / DAY));
}

export function formatDateTime(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

const SOURCE_LABELS: Record<string, string> = {
  meta_ads: "Meta Ads",
  dm: "DM",
  organic: "Organik",
  komunitas: "Komunitas",
  canvassing: "Canvassing",
  referral: "Referral",
  manual: "Manual",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? (source || "—");
}

const ACTIVITY_LABELS: Record<string, string> = {
  note: "Catatan",
  call: "Telepon",
  wa: "WhatsApp",
  visit: "Kunjungan",
  stage_change: "Pindah stage",
  assign: "Ganti sales",
  created: "Dibuat",
};

export function activityLabel(type: string): string {
  return ACTIVITY_LABELS[type] ?? type;
}
