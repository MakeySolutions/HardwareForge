"use client";

import { useMemo, useState } from "react";
import { X, Search, CheckSquare, Cpu } from "lucide-react";
import type { WhiteboardLinkData } from "@/server/queries";
import { TASK_STATUS, PART_CATEGORY } from "@/lib/constants";
import { formatEur, cn } from "@/lib/utils";
import { Button, Input } from "@/components/ui";

export function LinkPanel({
  linkData,
  onClose,
  onPick,
}: {
  linkData: WhiteboardLinkData;
  onClose: () => void;
  onPick: (kind: "task" | "part", id: string) => void;
}) {
  const [tab, setTab] = useState<"task" | "part">("task");
  const [q, setQ] = useState("");

  const tasks = useMemo(
    () =>
      linkData.tasks.filter((t) =>
        t.title.toLowerCase().includes(q.toLowerCase()),
      ),
    [linkData.tasks, q],
  );
  const parts = useMemo(
    () =>
      linkData.parts.filter((p) =>
        p.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [linkData.parts, q],
  );

  return (
    <div className="animate-in fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl shadow-black/40">
      <div className="flex h-12 items-center justify-between border-b border-[var(--border)] px-3">
        <span className="text-sm font-semibold">Link to Map</span>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex gap-1 border-b border-[var(--border)] p-2">
        <TabBtn active={tab === "task"} onClick={() => setTab("task")}>
          <CheckSquare className="size-3.5" /> Tasks
        </TabBtn>
        <TabBtn active={tab === "part"} onClick={() => setTab("part")}>
          <Cpu className="size-3.5" /> Parts
        </TabBtn>
      </div>

      <div className="p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {tab === "task" ? (
          tasks.length === 0 ? (
            <Empty>No tasks</Empty>
          ) : (
            tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => onPick("task", t.id)}
                className="focus-ring flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--surface-hover)]"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: TASK_STATUS[t.status].dot }}
                />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                  {TASK_STATUS[t.status].label}
                </span>
              </button>
            ))
          )
        ) : parts.length === 0 ? (
          <Empty>No parts</Empty>
        ) : (
          parts.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick("part", p.id)}
              className="focus-ring flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--surface-hover)]"
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  p.acquired ? "bg-emerald-400" : "bg-orange-400",
                )}
              />
              <span className="min-w-0 flex-1 truncate">
                {p.name}
                <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                  {PART_CATEGORY[p.category]}
                </span>
              </span>
              <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                {p.unitPrice != null
                  ? formatEur(Number(p.unitPrice) * p.quantity)
                  : `${p.quantity}×`}
              </span>
            </button>
          ))
        )}
      </div>

      <p className="border-t border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
        Click an item — it&apos;s inserted at the center of the map as a card that colors itself by status.
      </p>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-[var(--accent)]/12 text-[var(--accent)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]",
      )}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 py-8 text-center text-xs text-[var(--text-muted)]">{children}</p>
  );
}
