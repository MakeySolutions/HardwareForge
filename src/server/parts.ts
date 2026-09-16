"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { IMAGE_MIME_EXT, newKey, removeKeys, saveBuffer } from "@/lib/storage";
import { logActivity } from "./activity";
import { projectSlug as slugOf } from "./queries";

const MAX_PART_IMAGE = 5 * 1024 * 1024;
// SVG zamerne nie - obrazok suciastky je vzdy fotka, SVG by bol zbytocny risk (skripty)
const PART_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Obrazok z formulara -> ulozeny kluc, alebo null ked sa nic nenahralo. */
async function saveImage(formData: FormData): Promise<string | null> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_PART_IMAGE) throw new Error("Image is larger than 5 MB");
  if (!PART_IMAGE_TYPES.includes(file.type)) throw new Error("Unsupported image type");

  const key = newKey(["parts"], IMAGE_MIME_EXT[file.type]);
  await saveBuffer(key, new Uint8Array(await file.arrayBuffer()));
  return key;
}

const categoryEnum = z.enum([
  "MCU",
  "DISPLAY",
  "LED",
  "AUDIO",
  "SENSOR",
  "POWER",
  "MECHANICAL",
  "CABLE",
  "OTHER",
]);

/** Prazdne pole formulara -> null, nie 0. Nula by skreslila vypocty. */
function optionalNumber(value: FormDataEntryValue | null): string | null {
  const s = value?.toString().trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? s : null;
}

function optionalUrl(value: FormDataEntryValue | null): string | null {
  const s = value?.toString().trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

function readForm(formData: FormData) {
  return {
    name: z.string().trim().min(1, "Name is required").max(160).parse(formData.get("name")),
    category: categoryEnum.parse(formData.get("category") || "OTHER"),
    quantity: Math.max(
      1,
      Math.min(100_000, Number(formData.get("quantity")?.toString() || "1") || 1),
    ),
    unitPrice: optionalNumber(formData.get("unitPrice")),
    voltage: optionalNumber(formData.get("voltage")),
    currentMa: optionalNumber(formData.get("currentMa")),
    shopUrl: optionalUrl(formData.get("shopUrl")),
    partNumber: formData.get("partNumber")?.toString().trim() || null,
    notes: formData.get("notes")?.toString().trim() || null,
    acquired: formData.get("acquired") === "on" || formData.get("acquired") === "true",
  };
}

export async function createPart(projectId: string, formData: FormData) {
  await requireAuth();
  const data = readForm(formData);
  const imageKey = await saveImage(formData);

  try {
    await db.$transaction(async (tx) => {
      await tx.part.create({ data: { projectId, ...data, imageKey } });
      await logActivity(tx, projectId, "PART_ADDED", `Added part "${data.name}"`);
    });
  } catch (err) {
    await removeKeys([imageKey]);
    throw err;
  }

  revalidatePath(`/p/${await slugOf(projectId)}`, "layout");
}

export async function updatePart(partId: string, formData: FormData) {
  await requireAuth();
  const part = await db.part.findUniqueOrThrow({ where: { id: partId } });
  const data = readForm(formData);
  const newImage = await saveImage(formData);
  const removeImage = formData.get("removeImage") === "on";
  // undefined = obrazok sa nemeni
  const imageKey = newImage ?? (removeImage ? null : undefined);

  try {
    await db.$transaction(async (tx) => {
      await tx.part.update({ where: { id: partId }, data: { ...data, imageKey } });
      await logActivity(tx, part.projectId, "PART_UPDATED", `Updated part "${data.name}"`);
    });
  } catch (err) {
    await removeKeys([newImage]);
    throw err;
  }
  if (imageKey !== undefined) await removeKeys([part.imageKey]);

  revalidatePath(`/p/${await slugOf(part.projectId)}`, "layout");
}

/** Prepnutie "uz kupene" - ovplyvnuje nakupny zoznam. */
export async function togglePartAcquired(partId: string) {
  await requireAuth();
  const part = await db.part.findUniqueOrThrow({ where: { id: partId } });
  await db.part.update({ where: { id: partId }, data: { acquired: !part.acquired } });
  revalidatePath(`/p/${await slugOf(part.projectId)}`, "layout");
}

export async function deletePart(partId: string) {
  await requireAuth();
  const part = await db.part.findUniqueOrThrow({ where: { id: partId } });

  await db.$transaction(async (tx) => {
    await tx.part.delete({ where: { id: partId } });
    await logActivity(tx, part.projectId, "PART_REMOVED", `Removed part "${part.name}"`);
  });
  await removeKeys([part.imageKey]);

  revalidatePath(`/p/${await slugOf(part.projectId)}`, "layout");
}
