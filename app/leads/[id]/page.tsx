import Link from "next/link";
import { Suspense } from "react";
import { LeadDetail } from "@/components/lead/detail";
import { Topbar } from "@/components/shell/topbar";

/** `params` berbentuk Promise di Next.js 16 — akses sinkron sudah tidak jalan. */
export default async function LeadPage(props: PageProps<"/leads/[id]">) {
  const { id } = await props.params;

  return (
    <Suspense fallback={<div className="flex-1 bg-paper" />}>
      <Topbar />
      <main className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col overflow-y-auto border-x border-line pt-4">
        <div className="px-5 pb-1">
          <Link
            href="/"
            className="type-micro text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            ← Kembali ke papan
          </Link>
        </div>
        <LeadDetail leadId={id} showPageLink={false} />
      </main>
    </Suspense>
  );
}
