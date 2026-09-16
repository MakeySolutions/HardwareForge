"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { guessLinkType } from "@/lib/constants";
import { removeKeys } from "@/lib/storage";
import { logActivity } from "./activity";
import { projectSlug as slugOf } from "./queries";

const linkTypeEnum = z.enum([
  "GITHUB",
  "YOUTUBE",
  "DATASHEET",
  "SHOP",
  "DOCS",
  "INSPIRATION",
  "OTHER",
]);

// ------------------------------------------------------------------ odkazy

export async function createLink(projectId: string, formData: FormData) {
  await requireAuth();

  const url = z
    .string()
    .trim()
    .url("Enter a valid URL including https://")
    .parse(formData.get("url"));
  const title = formData.get("title")?.toString().trim() || new URL(url).hostname;
  const typeRaw = formData.get("type")?.toString();
  // Prazdny vyber -> typ sa uhadne z domeny
  const type = typeRaw ? linkTypeEnum.parse(typeRaw) : guessLinkType(url);
  const notes = formData.get("notes")?.toString().trim() || null;

  await db.$transaction(async (tx) => {
    await tx.link.create({ data: { projectId, url, title, type, notes } });
    await logActivity(tx, projectId, "LINK_ADDED", `Added link "${title}"`);
  });

  revalidatePath(`/p/${await slugOf(projectId)}`, "layout");
}

export async function deleteLink(linkId: string) {
  await requireAuth();
  const link = await db.link.findUniqueOrThrow({ where: { id: linkId } });
  await db.link.delete({ where: { id: linkId } });
  revalidatePath(`/p/${await slugOf(link.projectId)}`, "layout");
}

// --------------------------------------------------------------- poznamky

export async function createNote(projectId: string) {
  await requireAuth();
  const note = await db.note.create({
    data: { projectId, title: "New note", content: "" },
  });
  revalidatePath(`/p/${await slugOf(projectId)}`, "layout");
  return note.id;
}

export async function saveNote(noteId: string, title: string, content: string) {
  await requireAuth();
  const note = await db.note.findUniqueOrThrow({ where: { id: noteId } });

  const safeTitle = title.trim().slice(0, 160) || "Untitled";
  await db.$transaction(async (tx) => {
    await tx.note.update({
      where: { id: noteId },
      data: { title: safeTitle, content: content.slice(0, 100_000) },
    });
    await logActivity(tx, note.projectId, "NOTE_UPDATED", `Updated note "${safeTitle}"`);
  });

  revalidatePath(`/p/${await slugOf(note.projectId)}`, "layout");
}

export async function toggleNotePinned(noteId: string) {
  await requireAuth();
  const note = await db.note.findUniqueOrThrow({ where: { id: noteId } });
  await db.note.update({ where: { id: noteId }, data: { pinned: !note.pinned } });
  revalidatePath(`/p/${await slugOf(note.projectId)}`, "layout");
}

export async function deleteNote(noteId: string) {
  await requireAuth();
  const note = await db.note.findUniqueOrThrow({ where: { id: noteId } });
  await db.note.delete({ where: { id: noteId } });
  revalidatePath(`/p/${await slugOf(note.projectId)}`, "layout");
}

// ----------------------------------------------------------------- subory

// Nahravanie riesi route /api/upload (streamuje priamo na disk).

export async function deleteFile(fileId: string) {
  await requireAuth();
  const file = await db.fileAsset.findUniqueOrThrow({ where: { id: fileId } });

  await db.$transaction(async (tx) => {
    await tx.fileAsset.delete({ where: { id: fileId } });
    await logActivity(tx, file.projectId, "FILE_DELETED", `Deleted file "${file.name}"`);
  });
  // Az po DB: ked zlyha mazanie z disku, UI aj tak nema mrtvy zaznam
  // a subor neskor odstrani upratovanie osirelych suborov.
  await removeKeys([file.storageKey]);

  revalidatePath(`/p/${await slugOf(file.projectId)}`, "layout");
}
