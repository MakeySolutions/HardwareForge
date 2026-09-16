"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { toast } from "sonner";
import { moveTask } from "@/server/tasks";
import { KANBAN_COLUMNS, TASK_STATUS } from "@/lib/constants";
import type { TaskStatus } from "@/generated/prisma/client";
import { KanbanColumn } from "./kanban-column";
import { TaskCard } from "./task-card";
import { NewTaskButton } from "./task-dialog";

export type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  order: number;
  dueDate: string | null;
};

type Move = { taskId: string; toStatus: TaskStatus; toIndex: number };

export function KanbanBoard({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: BoardTask[];
}) {
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Optimisticky stav: karta sa presunie okamzite, server dobehne.
  // Pri chybe React sam vrati povodny stav po skonceni transition.
  const [optimistic, applyMove] = useOptimistic(tasks, (state: BoardTask[], move: Move) => {
    const moved = state.find((t) => t.id === move.taskId);
    if (!moved) return state;

    const others = state.filter((t) => t.id !== move.taskId && t.status !== move.toStatus);
    const target = state
      .filter((t) => t.id !== move.taskId && t.status === move.toStatus)
      .sort((a, b) => a.order - b.order);

    target.splice(move.toIndex, 0, { ...moved, status: move.toStatus });

    // Poradie v ramci cieloveho stlpca prepiseme indexom, aby sa
    // karta vykreslila presne tam, kam ju pouzivatel pustil.
    return [...others, ...target.map((t, i) => ({ ...t, order: i }))];
  });

  const byColumn = useMemo(() => {
    const map = new Map<TaskStatus, BoardTask[]>();
    for (const col of KANBAN_COLUMNS) {
      map.set(
        col,
        optimistic.filter((t) => t.status === col).sort((a, b) => a.order - b.order),
      );
    }
    return map;
  }, [optimistic]);

  const sensors = useSensors(
    // 8px prah - bez neho by sa kazde kliknutie na kartu chapalo ako tahanie
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const task = optimistic.find((t) => t.id === active.id);
    if (!task) return;

    // `over` je bud iná karta, alebo prazdny stlpec
    const overTask = optimistic.find((t) => t.id === over.id);
    const toStatus = (overTask?.status ?? (over.id as TaskStatus)) as TaskStatus;
    if (!KANBAN_COLUMNS.includes(toStatus)) return;

    const column = (byColumn.get(toStatus) ?? []).filter((t) => t.id !== task.id);
    const toIndex = overTask ? column.findIndex((t) => t.id === overTask.id) : column.length;
    const finalIndex = toIndex < 0 ? column.length : toIndex;

    const currentIndex = (byColumn.get(task.status) ?? []).findIndex((t) => t.id === task.id);
    if (task.status === toStatus && currentIndex === finalIndex) return;

    startTransition(async () => {
      applyMove({ taskId: task.id, toStatus, toIndex: finalIndex });
      try {
        await moveTask(task.id, toStatus, finalIndex);
      } catch {
        toast.error("Move failed");
      }
    });
  }

  const activeTask = activeId ? optimistic.find((t) => t.id === activeId) : null;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">
          {optimistic.length === 0
            ? "No tasks yet"
            : `${optimistic.filter((t) => t.status === "DONE").length}/${optimistic.length} done`}
        </p>
        <NewTaskButton projectId={projectId} />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="thin-scroll flex gap-4 overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map((status) => {
            const items = byColumn.get(status) ?? [];
            return (
              <KanbanColumn
                key={status}
                status={status}
                label={TASK_STATUS[status].label}
                dot={TASK_STATUS[status].dot}
                count={items.length}
                projectId={projectId}
              >
                <SortableContext
                  items={items.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {items.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </SortableContext>
              </KanbanColumn>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <div className="rotate-2 scale-105 shadow-2xl shadow-black/50">
              <TaskCard task={activeTask} overlay />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </>
  );
}
