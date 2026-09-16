import { db } from "@/lib/db";
import { isAuthorized } from "@/lib/auth";
import { mimeForKey, openRead } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Servovanie lokalnych suborov. Subor sa hlada podla ID zaznamu v DB -
 * cesta na disku nikdy nepochadza z URL, takze "/api/files/file/..%2F.."
 * nema ako ujst mimo uloziska.
 */
async function lookup(kind: string, id: string): Promise<{ key: string; name: string } | null> {
  switch (kind) {
    case "file": {
      const f = await db.fileAsset.findUnique({
        where: { id },
        select: { storageKey: true, name: true },
      });
      return f && { key: f.storageKey, name: f.name };
    }
    case "map-image": {
      const f = await db.whiteboardFile.findUnique({
        where: { id },
        select: { storageKey: true, fileId: true },
      });
      return f && { key: f.storageKey, name: f.fileId };
    }
    case "map-thumb": {
      const w = await db.whiteboard.findUnique({ where: { id }, select: { thumbnailKey: true } });
      return w?.thumbnailKey ? { key: w.thumbnailKey, name: "thumbnail" } : null;
    }
    case "part-image": {
      const p = await db.part.findUnique({ where: { id }, select: { imageKey: true, name: true } });
      return p?.imageKey ? { key: p.imageKey, name: p.name } : null;
    }
    default:
      return null;
  }
}

function contentDisposition(type: "inline" | "attachment", name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  if (!(await isAuthorized())) {
    return new Response("Access denied", { status: 403 });
  }

  const { kind, id } = await params;
  const found = await lookup(kind, id);
  const file = found && (await openRead(found.key));
  if (!found || !file) return new Response("File not found", { status: 404 });

  const mime = mimeForKey(found.key);
  const inline = mime !== null && !new URL(request.url).searchParams.has("download");

  const headers = new Headers({
    "Content-Type": mime ?? "application/octet-stream",
    "Content-Length": String(file.size),
    "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", found.name),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-cache",
  });
  // SVG moze obsahovat <script>. CSP sandbox zabrani jeho spusteniu aj pri
  // priamom otvoreni suboru. PDF ho nedostane - vstavany prehliadac PDF by
  // sa pod sandboxom nenacital.
  if (mime !== "application/pdf") {
    headers.set(
      "Content-Security-Policy",
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    );
  }

  return new Response(file.stream, { headers });
}
