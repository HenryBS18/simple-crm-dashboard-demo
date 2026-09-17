import { type AiTask, prospectBatchPayloadSchema } from "@/lib/schema";

/**
 * Apa yang sudah pernah terjadi pada sebuah prospek, dibaca dari antrian
 * persetujuan. `ai.prospect.search` sendiri tidak pernah melihat `crm_ai_tasks`
 * — dia hanya mencocokkan nomor dengan `crm_leads` — jadi tanpa turunan ini
 * prospek yang kartunya terlihat jelas di kolom sebelah tetap tampil sebagai
 * kandidat bebas pilih.
 */
export type ProspectDecisions = {
  /** Menunggu keputusan atau sudah jadi lead: tidak ditampilkan lagi. */
  hidden: Set<string>;
  /** prospectId -> `decidedAt` penolakan terakhir. */
  rejectedAt: Map<string, string>;
  /** prospectId -> `decidedAt` percobaan yang gagal dijalankan. */
  failedAt: Map<string, string>;
};

/**
 * Menolak satu usulan batch bukan vonis permanen atas prospeknya: tidak ada
 * layar untuk melihat atau membatalkan prospek yang disembunyikan, jadi yang
 * ditolak tetap dikembalikan ke tabel dengan tanda, bukan dibuang.
 */
export function prospectDecisions(tasks: AiTask[]): ProspectDecisions {
  const hidden = new Set<string>();
  const rejectedAt = new Map<string, string>();
  const failedAt = new Map<string, string>();

  for (const task of tasks) {
    if (task.kind !== "prospect_batch") continue;

    const parsed = prospectBatchPayloadSchema.safeParse(task.payload);
    if (!parsed.success) continue;

    const ids = new Set([
      ...parsed.data.prospectIds,
      ...parsed.data.prospects.map((prospect) => prospect.id),
    ]);

    for (const id of ids) {
      if (task.status === "pending" || task.status === "approved") {
        hidden.add(id);
        continue;
      }
      // `ai.tasks.list` mengurut menurut prioritas, bukan waktu, jadi keputusan
      // terbaru harus dicari — bukan diambil dari yang lewat terakhir.
      const bucket = task.status === "rejected" ? rejectedAt : failedAt;
      const previous = bucket.get(id);
      if (!previous || task.decidedAt > previous)
        bucket.set(id, task.decidedAt);
    }
  }

  // Prospek yang pernah ditolak lalu diantrikan ulang harus hilang, bukan
  // tampil bertanda.
  for (const id of hidden) {
    rejectedAt.delete(id);
    failedAt.delete(id);
  }

  return { hidden, rejectedAt, failedAt };
}
