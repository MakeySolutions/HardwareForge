"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  setLinkedTaskStatus,
  setLinkedTaskPriority,
  toggleLinkedPart,
} from "@/server/whiteboards";
import type { WhiteboardLinkData } from "@/server/queries";
import type { HfCardData } from "@/lib/whiteboard/cards";
import { TASK_STATUS, PRIORITY, KANBAN_COLUMNS, PART_CATEGORY } from "@/lib/constants";
import { NativeSelect } from "@/components/ui";
import { formatEur } from "@/lib/utils";

/**
 * Plávajúci panel pri označení práve jednej prepojenej karty.
 * Zmeny idú do Kanbanu / Súčiastok a späť na mapu cez router.refresh().
 */
export function CardInspector({
  card,
  linkData,
  slug,
  onChanged,
}: {
  card: HfCardData;
  linkData: WhiteboardLinkData;
  slug: string;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const task =
    card.hf === "task" ? linkData.tasks.find((t) => t.id === card.refId) : null;
  const part =
    card.hf === "part" ? linkData.parts.find((p) => p.id === card.refId) : null;

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await fn();
        onChanged();
      } catch {
        toast.error("Change failed");
      }
    });

  return (
    <div className="animate-in absolute top-3 left-1/2 z-30 w-[min(92vw,380px)] -translate-x-1/2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-3 shadow-2xl shadow-black/40">
      {task && (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium">{task.title}</p>
            <Link
              href={`/p/${slug}/board`}
              className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text)]"
              aria-label="Open in Board"
            >
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-[var(--text-muted)]">
              Status
              <NativeSelect
                className="mt-1 h-8 text-xs"
                value={task.status}
                disabled={pending}
                onChange={(e) => run(() => setLinkedTaskStatus(task.id, e.target.value))}
              >
                {KANBAN_COLUMNS.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS[s].label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="text-[11px] text-[var(--text-muted)]">
              Priority
              <NativeSelect
                className="mt-1 h-8 text-xs"
                value={task.priority}
                disabled={pending}
                onChange={(e) => run(() => setLinkedTaskPriority(task.id, e.target.value))}
              >
                {Object.entries(PRIORITY).map(([k, m]) => (
                  <option key={k} value={k}>
                    {m.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
        </>
      )}

      {part && (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{part.name}</p>
              <p className="text-[11px] text-[var(--text-muted)]">
                {PART_CATEGORY[part.category]} · {part.quantity}×
                {part.unitPrice != null &&
                  ` · ${formatEur(Number(part.unitPrice) * part.quantity)}`}
              </p>
            </div>
            <Link
              href={`/p/${slug}/parts`}
              className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text)]"
              aria-label="Open in Parts"
            >
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={part.acquired}
              disabled={pending}
              onChange={() => run(() => toggleLinkedPart(part.id))}
              className="focus-ring size-4 accent-[var(--accent)]"
            />
            Already bought
          </label>
        </>
      )}

      {!task && !part && (
        <p className="text-xs text-[var(--text-muted)]">
          The linked item was deleted from the project.
        </p>
      )}
    </div>
  );
}
