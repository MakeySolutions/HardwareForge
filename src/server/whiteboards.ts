"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { removeKeys } from "@/lib/storage";
import { logActivity } from "./activity";
import { projectSlug as slugOfProject } from "./queries";
import { moveTask } from "./tasks";
import { togglePartAcquired } from "./parts";

const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

// Excalidraw scena vie narast (vela tvarov) - strop drzi DB aj payload rozumny.
const MAX_SCENE_BYTES = 5 * 1024 * 1024;

async function boardContext(whiteboardId: string) {
  const wb = await db.whiteboard.findUniqueOrThrow({
    where: { id: whiteboardId },
    select: { id: true, projectId: true, project: { select: { slug: true } } },
  });
  return { projectId: wb.projectId, slug: wb.project.slug };
}

// ---------------------------------------------------------------- CRUD

export async function createWhiteboard(projectId: string, formData: FormData) {
  await requireAuth();

  const title = z
    .string()
    .trim()
    .min(1)
    .max(120)
    .catch("New Map")
    .parse(formData.get("title") || "New Map");
  const template = (formData.get("template")?.toString() || "blank").slice(0, 40);

  const last = await db.whiteboard.findFirst({
    where: { projectId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const wb = await db.$transaction(async (tx) => {
    const created = await tx.whiteboard.create({
      data: { projectId, title, order: last ? last.order + 1024 : 1024 },
    });
    await logActivity(tx, projectId, "WHITEBOARD_CREATED", `Created map "${title}"`);
    return created;
  });

  revalidatePath(`/p/${await slugOfProject(projectId)}/maps`);
  redirect(`/p/${await slugOfProject(projectId)}/maps/${wb.id}?template=${template}`);
}

export async function renameWhiteboard(whiteboardId: string, title: string) {
  await requireAuth();
  const safe = title.trim().slice(0, 120) || "New Map";
  const { slug } = await boardContext(whiteboardId);
  await db.whiteboard.update({ where: { id: whiteboardId }, data: { title: safe } });
  revalidatePath(`/p/${slug}/maps`);
  revalidatePath(`/p/${slug}/maps/${whiteboardId}`);
}

export async function deleteWhiteboard(whiteboardId: string) {
  await requireAuth();

  const wb = await db.whiteboard.findUniqueOrThrow({
    where: { id: whiteboardId },
    include: {
      files: { select: { storageKey: true } },
      project: { select: { slug: true, id: true } },
    },
  });

  await db.$transaction(async (tx) => {
    await tx.whiteboard.delete({ where: { id: whiteboardId } });
    await logActivity(tx, wb.project.id, "WHITEBOARD_DELETED", `Deleted map "${wb.title}"`);
  });
  // Obrazky + nahlad az po DB - best effort, zlyhanie neblokuje mazanie mapy.
  await removeKeys([...wb.files.map((f) => f.storageKey), wb.thumbnailKey]);

  revalidatePath(`/p/${wb.project.slug}/maps`);
  redirect(`/p/${wb.project.slug}/maps`);
}

// ---------------------------------------------------------------- autosave

export async function saveWhiteboard(whiteboardId: string, elements: unknown, appState: unknown) {
  await requireAuth();

  if (!Array.isArray(elements)) throw new Error("Invalid scene");
  const serialized = JSON.stringify(elements);
  if (serialized.length > MAX_SCENE_BYTES) {
    throw new Error("Map is too large to save");
  }

  // Zamerne bez revalidatePath - editor drzi vlastny stav a autosave bezi casto.
  await db.whiteboard.update({
    where: { id: whiteboardId },
    data: {
      elements: JSON.parse(serialized) as Prisma.InputJsonValue,
      appState:
        appState === undefined
          ? undefined
          : appState === null
            ? Prisma.JsonNull
            : (appState as Prisma.InputJsonValue),
    },
  });
}

// Obrazky mapy a nahlady nahrava route /api/upload (target=map-image / map-thumb).

// ---------------------------------------------------------------- prepojene karty

export async function setLinkedTaskStatus(taskId: string, status: string) {
  await requireAuth();
  // Znovu pouzitie logiky Kanbanu: velky index = koniec cieloveho stlpca.
  await moveTask(taskId, status, Number.MAX_SAFE_INTEGER);
}

export async function setLinkedTaskPriority(taskId: string, priority: string) {
  await requireAuth();
  const value = priorityEnum.parse(priority);
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { projectId: true, project: { select: { slug: true } } },
  });
  await db.task.update({ where: { id: taskId }, data: { priority: value } });
  revalidatePath(`/p/${task.project.slug}`, "layout");
}

export async function toggleLinkedPart(partId: string) {
  await requireAuth();
  await togglePartAcquired(partId);
}
