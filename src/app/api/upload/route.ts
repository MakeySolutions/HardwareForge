import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAuthorized } from "@/lib/auth";
import { detectFileKind } from "@/lib/constants";
import {
  IMAGE_MIME_EXT,
  MAX_IMAGE_BYTES,
  MAX_UPLOAD_BYTES,
  newKey,
  removeKeys,
  safeExt,
  saveStream,
  TooLargeError,
} from "@/lib/storage";
import { logActivity } from "@/server/activity";

export const runtime = "nodejs";

/**
 * Nahranie suboru do lokalneho uloziska. Telo requestu = samotny subor,
 * streamuje sa rovno na disk (aj 100 MB STL bez nacitania do pamate).
 *
 * Tato routa je VYNECHANA z proxy (proxy by telo nad 10 MB potichu orezal),
 * preto si pristup overuje sama cez isAuthorized() - rovnaka kontrola hosta,
 * originu a tokenu ako v proxy.
 */

const id = z.string().regex(/^[a-z0-9]{8,40}$/i);
const excalidrawFileId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const MAX_THUMB_BYTES = 2 * 1024 * 1024;

function fail(status: number, message: string) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  if (!(await isAuthorized())) return fail(403, "Access denied");
  if (!request.body) return fail(400, "Missing file content");

  const params = new URL(request.url).searchParams;
  try {
    switch (params.get("target")) {
      case "project":
        return await uploadProjectFile(params, request.body);
      case "map-image":
        return await uploadMapImage(params, request.body);
      case "map-thumb":
        return await uploadMapThumbnail(params, request.body);
      default:
        return fail(400, "Unknown upload target");
    }
  } catch (err) {
    if (err instanceof TooLargeError) return fail(413, err.message);
    if (err instanceof z.ZodError) return fail(400, "Invalid parameters");
    console.error("upload:", err);
    return fail(500, "Upload failed");
  }
}

async function uploadProjectFile(params: URLSearchParams, body: ReadableStream<Uint8Array>) {
  const projectId = id.parse(params.get("projectId"));
  const name = z.string().trim().min(1).max(255).parse(params.get("name"));

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { slug: true },
  });
  if (!project) return fail(404, "Project does not exist");

  const key = newKey(["projects", projectId], safeExt(name));
  const size = await saveStream(key, body, MAX_UPLOAD_BYTES);

  try {
    const file = await db.$transaction(async (tx) => {
      const created = await tx.fileAsset.create({
        data: { projectId, name, storageKey: key, sizeBytes: size, kind: detectFileKind(name) },
      });
      await logActivity(tx, projectId, "FILE_UPLOADED", `Uploaded file "${name}"`);
      return created;
    });
    revalidatePath(`/p/${project.slug}`, "layout");
    return Response.json({ id: file.id });
  } catch (err) {
    // Subor je na disku, ale zaznam sa nevytvoril -> nenechavat sirotu
    await removeKeys([key]);
    throw err;
  }
}

async function uploadMapImage(params: URLSearchParams, body: ReadableStream<Uint8Array>) {
  const whiteboardId = id.parse(params.get("whiteboardId"));
  const fileId = excalidrawFileId.parse(params.get("fileId"));
  const mimeType = z.string().parse(params.get("mime"));
  const ext = IMAGE_MIME_EXT[mimeType];
  if (!ext) return fail(415, "Unsupported image type");

  const board = await db.whiteboard.findUnique({ where: { id: whiteboardId }, select: { id: true } });
  if (!board) return fail(404, "Map does not exist");

  const key = newKey(["whiteboards", whiteboardId], ext);
  const size = await saveStream(key, body, MAX_IMAGE_BYTES);

  try {
    const previous = await db.whiteboardFile.findUnique({
      where: { whiteboardId_fileId: { whiteboardId, fileId } },
      select: { storageKey: true },
    });
    const row = await db.whiteboardFile.upsert({
      where: { whiteboardId_fileId: { whiteboardId, fileId } },
      create: { whiteboardId, fileId, storageKey: key, mimeType, sizeBytes: size },
      update: { storageKey: key, mimeType, sizeBytes: size },
    });
    if (previous) await removeKeys([previous.storageKey]);
    return Response.json({ id: row.id });
  } catch (err) {
    await removeKeys([key]);
    throw err;
  }
}

async function uploadMapThumbnail(params: URLSearchParams, body: ReadableStream<Uint8Array>) {
  const whiteboardId = id.parse(params.get("whiteboardId"));
  const board = await db.whiteboard.findUnique({
    where: { id: whiteboardId },
    select: { thumbnailKey: true, project: { select: { slug: true } } },
  });
  if (!board) return fail(404, "Map does not exist");

  const key = newKey(["whiteboards", whiteboardId], "webp");
  await saveStream(key, body, MAX_THUMB_BYTES);

  try {
    await db.whiteboard.update({ where: { id: whiteboardId }, data: { thumbnailKey: key } });
  } catch (err) {
    await removeKeys([key]);
    throw err;
  }
  await removeKeys([board.thumbnailKey]);
  revalidatePath(`/p/${board.project.slug}/maps`);
  return Response.json({ id: whiteboardId });
}
