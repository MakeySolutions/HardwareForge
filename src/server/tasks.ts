"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { computeOrder, needsRebalance, ORDER_STEP } from "@/lib/ordering";
import { logActivity } from "./activity";
import { projectSlug as slugOf } from "./queries";
import { TASK_STATUS } from "@/lib/constants";

const taskStatusEnum = z.enum(["TODO", "IN_PROGRESS", "WAITING", "TESTING", "DONE"]);
const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export async function createTask(projectId: string, formData: FormData) {
  await requireAuth();

  const title = z.string().trim().min(1).max(200).parse(formData.get("title"));
  const status = taskStatusEnum.parse(formData.get("status") || "TODO");
  const priority = priorityEnum.parse(formData.get("priority") || "MEDIUM");
  const description = formData.get("description")?.toString().trim() || null;
  const dueRaw = formData.get("dueDate")?.toString();

  // Nova uloha ide na koniec stlpca
  const last = await db.task.findFirst({
    where: { projectId, status },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await db.$transaction(async (tx) => {
    await tx.task.create({
      data: {
        projectId,
        title,
        description,
        status,
        priority,
        dueDate: dueRaw ? new Date(dueRaw) : null,
        order: last ? last.order + ORDER_STEP : ORDER_STEP,
        completedAt: status === "DONE" ? new Date() : null,
      },
    });
    await logActivity(tx, projectId, "TASK_CREATED", `Added task "${title}"`);
  });

  revalidatePath(`/p/${await slugOf(projectId)}`, "layout");
}

export async function updateTask(taskId: string, formData: FormData) {
  await requireAuth();

  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  const title = z.string().trim().min(1).max(200).parse(formData.get("title"));
  const priority = priorityEnum.parse(formData.get("priority") || task.priority);
  const description = formData.get("description")?.toString().trim() || null;
  const dueRaw = formData.get("dueDate")?.toString();

  await db.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { title, description, priority, dueDate: dueRaw ? new Date(dueRaw) : null },
    });
    await logActivity(tx, task.projectId, "TASK_CREATED", `Updated task "${title}"`);
  });

  revalidatePath(`/p/${await slugOf(task.projectId)}`, "layout");
}

/**
 * Presun karty v Kanbane. `toIndex` je pozicia v cielovom stlpci
 * po odstraneni presuvanej karty.
 */
export async function moveTask(taskId: string, toStatus: string, toIndex: number) {
  await requireAuth();
  const status = taskStatusEnum.parse(toStatus);

  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });

  const column = await db.task.findMany({
    where: { projectId: task.projectId, status, id: { not: taskId } },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });

  const index = Math.max(0, Math.min(toIndex, column.length));
  const prev = column[index - 1]?.order;
  const next = column[index]?.order;

  await db.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: {
        status,
        order: computeOrder(prev, next),
        // Prechod do/z Done riadi completedAt. Uz raz dokoncena uloha
        // si pri opakovanom presune do Done drzi povodny datum.
        completedAt: status === "DONE" ? (task.completedAt ?? new Date()) : null,
      },
    });

    if (task.status !== status) {
      await logActivity(
        tx,
        task.projectId,
        status === "DONE" ? "TASK_COMPLETED" : "TASK_MOVED",
        `Task "${task.title}" moved to ${TASK_STATUS[status].label}`,
      );
    }

    if (needsRebalance(prev, next)) {
      const all = await tx.task.findMany({
        where: { projectId: task.projectId, status },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      for (const [i, t] of all.entries()) {
        await tx.task.update({ where: { id: t.id }, data: { order: (i + 1) * ORDER_STEP } });
      }
    }
  });

  revalidatePath(`/p/${await slugOf(task.projectId)}`, "layout");
}

export async function deleteTask(taskId: string) {
  await requireAuth();
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });

  await db.$transaction(async (tx) => {
    await tx.task.delete({ where: { id: taskId } });
    await logActivity(tx, task.projectId, "TASK_DELETED", `Deleted task "${task.title}"`);
  });

  revalidatePath(`/p/${await slugOf(task.projectId)}`, "layout");
}
