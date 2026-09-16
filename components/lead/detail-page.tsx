"use client";

import { useRouter } from "next/navigation";
import { LeadDetail } from "@/components/lead/detail";

/**
 * Halaman lead adalah server component, jadi handler setelah hapus tidak bisa
 * dikirim dari sana. Pembungkus tipis ini yang memegang navigasinya.
 */
export function LeadDetailPage({ leadId }: { leadId: string }) {
  const router = useRouter();

  return (
    <LeadDetail
      leadId={leadId}
      showPageLink={false}
      onDeleted={() => router.push("/")}
    />
  );
}
