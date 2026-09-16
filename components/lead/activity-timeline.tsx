"use client";

import { cn } from "cn";
import { activityLabel, formatDateTime, relativeTime } from "@/lib/format";
import type { Activity } from "@/lib/schema";

const TONE: Record<string, string> = {
  stage_change: "bg-ink",
  assign: "bg-ink",
  created: "bg-line-strong",
  call: "bg-b2b",
  wa: "bg-b2b",
  visit: "bg-b2b",
  note: "bg-line-strong",
};

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return (
      <p className="text-xs text-ink-soft">
        Belum ada aktivitas. Tulis catatan pertama di bawah.
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 border-l border-line pl-4">
      {activities.map((activity) => (
        <li key={activity.id} className="relative">
          <span
            aria-hidden
            className={cn(
              "absolute -left-[18px] top-[6px] size-[7px] rounded-full ring-2 ring-paper",
              TONE[activity.type] ?? "bg-line-strong",
            )}
          />
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-ink">
              {activityLabel(activity.type)}
            </span>
            <span
              className="type-micro text-ink-soft"
              title={formatDateTime(activity.created_at)}
            >
              {relativeTime(activity.created_at)}
            </span>
            {activity.actor ? (
              <span className="ml-auto type-micro text-ink-soft">
                {activity.actor}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm leading-5 text-ink">
            {activity.content}
          </p>
        </li>
      ))}
    </ol>
  );
}
