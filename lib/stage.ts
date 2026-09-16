import type { Stage, StageInfo } from "@/lib/schema";

/**
 * Label yang diminta klien. Urutan kolom tetap datang dari `bootstrap`,
 * tapi teksnya dipaksa ke peta ini supaya papan selalu berbunyi
 * To Do / In Progress / Win / Fail apa pun yang dikirim backend.
 */
export const STAGE_LABELS: Record<Stage, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  won: "Win",
  lost: "Fail",
};

/** Urutan cadangan kalau `bootstrap` gagal atau mengirim daftar kosong. */
export const FALLBACK_STAGES: StageInfo[] = (
  ["todo", "in_progress", "won", "lost"] as const
).map((key) => ({ key, label: STAGE_LABELS[key] }));

export function isStage(value: string): value is Stage {
  return value in STAGE_LABELS;
}

export function stageLabel(key: string, fallback = ""): string {
  return isStage(key) ? STAGE_LABELS[key] : fallback || key;
}

/** Stage yang sudah selesai; dipakai untuk membedakan kolom secara struktural. */
export function isClosedStage(key: string): boolean {
  return key === "won" || key === "lost";
}

/**
 * Urutan dari bootstrap, dibersihkan: hanya stage yang dikenal, label dipaksa
 * ke label klien, dan kalau hasilnya kosong jatuh ke urutan cadangan.
 */
export function resolveStages(stages: StageInfo[] | undefined): StageInfo[] {
  const known = (stages ?? [])
    .filter((s) => isStage(s.key))
    .map((s) => ({ key: s.key, label: stageLabel(s.key, s.label) }));
  return known.length > 0 ? known : FALLBACK_STAGES;
}

export const EMPTY_COLUMN_COPY: Record<Stage, string> = {
  todo: "Belum ada lead baru. Tambah lewat tombol di atas.",
  in_progress:
    "Belum ada yang digarap. Geser lead dari To Do kalau sudah dihubungi.",
  won: "Belum ada deal. Geser lead ke sini kalau closing.",
  lost: "Belum ada yang batal. Kolom ini untuk lead yang sudah pasti tidak jadi.",
};
