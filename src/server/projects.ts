"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { removeKeys } from "@/lib/storage";
import { slugify } from "@/lib/utils";
import { logActivity } from "./activity";
import { PROJECT_STATUS } from "@/lib/constants";

const statusEnum = z.enum(["IDEA", "PLANNING", "DEVELOPMENT", "TESTING", "DONE"]);
const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

const projectSchema = z.object({
  title: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(5000).optional().default(""),
  category: z.string().trim().min(1).max(60).default("Electronics"),
  status: statusEnum.default("IDEA"),
  priority: priorityEnum.default("MEDIUM"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Invalid color")
    .default("#7c8cff"),
  dueDate: z.string().optional(),
});

/** Zaruci unikatny slug aj ked uz projekt s rovnakym nazvom existuje. */
async function uniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title);
  const existing = await db.project.findMany({
    where: { slug: { startsWith: base }, ...(excludeId && { id: { not: excludeId } }) },
    select: { slug: true },
  });
  if (!existing.some((p) => p.slug === base)) return base;

  let i = 2;
  while (existing.some((p) => p.slug === `${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

export async function createProject(formData: FormData) {
  await requireAuth();

  const parsed = projectSchema.parse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    category: formData.get("category") || "Electronics",
    status: formData.get("status") || "IDEA",
    priority: formData.get("priority") || "MEDIUM",
    color: formData.get("color") || "#7c8cff",
    dueDate: formData.get("dueDate")?.toString() || undefined,
  });

  const slug = await uniqueSlug(parsed.title);

  const project = await db.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        slug,
        title: parsed.title,
        description: parsed.description || null,
        category: parsed.category,
        status: parsed.status,
        priority: parsed.priority,
        color: parsed.color,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      },
    });
    await logActivity(tx, p.id, "PROJECT_CREATED", `Created project "${p.title}"`);
    return p;
  });

  revalidatePath("/dashboard");
  redirect(`/p/${project.slug}`);
}

export async function updateProject(projectId: string, formData: FormData) {
  await requireAuth();

  const parsed = projectSchema.parse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    category: formData.get("category") || "Electronics",
    status: formData.get("status") || "IDEA",
    priority: formData.get("priority") || "MEDIUM",
    color: formData.get("color") || "#7c8cff",
    dueDate: formData.get("dueDate")?.toString() || undefined,
  });

  const before = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const slug =
    before.title === parsed.title ? before.slug : await uniqueSlug(parsed.title, projectId);

  await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: {
        slug,
        title: parsed.title,
        description: parsed.description || null,
        category: parsed.category,
        status: parsed.status,
        priority: parsed.priority,
        color: parsed.color,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      },
    });

    if (before.status !== parsed.status) {
      await logActivity(
        tx,
        projectId,
        "STATUS_CHANGED",
        `Status changed to ${PROJECT_STATUS[parsed.status].label}`,
      );
    } else {
      await logActivity(tx, projectId, "PROJECT_UPDATED", "Updated project details");
    }
  });

  revalidatePath("/dashboard");
  revalidatePath(`/p/${slug}`, "layout");
  if (slug !== before.slug) redirect(`/p/${slug}/settings`);
}

/** Rychla zmena stavu priamo z hlavicky projektu. */
export async function setProjectStatus(projectId: string, status: string) {
  await requireAuth();
  const value = statusEnum.parse(status);

  const before = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { status: true, slug: true },
  });
  if (before.status === value) return;

  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { status: value } });
    await logActivity(
      tx,
      projectId,
      "STATUS_CHANGED",
      `Status changed to ${PROJECT_STATUS[value].label}`,
    );
  });

  revalidatePath("/dashboard");
  revalidatePath(`/p/${before.slug}`, "layout");
}

export async function setProjectPriority(projectId: string, priority: string) {
  await requireAuth();
  const value = priorityEnum.parse(priority);
  const p = await db.project.update({
    where: { id: projectId },
    data: { priority: value },
    select: { slug: true },
  });
  revalidatePath("/dashboard");
  revalidatePath(`/p/${p.slug}`, "layout");
}

export async function deleteProject(projectId: string) {
  await requireAuth();
  // Kluce suborov treba zozbierat PRED zmazanim - kaskada (onDelete: Cascade)
  // zmaze aj zaznamy o nich a potom by sa uz nedalo zistit, co zmazat z disku.
  const [files, boards, parts] = await Promise.all([
    db.fileAsset.findMany({ where: { projectId }, select: { storageKey: true } }),
    db.whiteboard.findMany({
      where: { projectId },
      select: { thumbnailKey: true, files: { select: { storageKey: true } } },
    }),
    db.part.findMany({ where: { projectId }, select: { imageKey: true } }),
  ]);

  await db.project.delete({ where: { id: projectId } });
  await removeKeys([
    ...files.map((f) => f.storageKey),
    ...boards.flatMap((b) => [b.thumbnailKey, ...b.files.map((f) => f.storageKey)]),
    ...parts.map((p) => p.imageKey),
  ]);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function archiveProject(projectId: string, archived: boolean) {
  await requireAuth();
  const p = await db.project.update({
    where: { id: projectId },
    data: { archivedAt: archived ? new Date() : null },
    select: { slug: true },
  });
  revalidatePath("/dashboard");
  revalidatePath(`/p/${p.slug}`, "layout");
}
