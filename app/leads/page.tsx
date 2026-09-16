import { Suspense } from "react";
import { LeadsTable } from "@/components/leads/leads-table";
import { Workspace } from "@/components/shell/workspace";

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-paper" />}>
      <Workspace>
        <LeadsTable />
      </Workspace>
    </Suspense>
  );
}
