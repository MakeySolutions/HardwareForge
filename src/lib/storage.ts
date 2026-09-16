import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { storageRoot } from "./paths";

/**
 * Lokalne ulozisko suborov (nahrada za Vercel Blob).
 *
 * Kluc suboru = relativna cesta pod storageRoot, napr.
 * "projects/<projectId>/<uuid>.stl". Meno od pouzivatela sa do cesty
 * NIKDY nedostane - ziadny path traversal ("../../Windows/..."), ziadne
 * kolizie mien, ziadne rezervovane nazvy Windows (CON, NUL...).
 */

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const IMAGE_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/** Typy, ktore sa smu zobrazit priamo v appke. Vsetko ostatne ide ako priloha. */
const INLINE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

export class TooLargeError extends Error {}

const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const EXT = /^[a-z0-9]{1,8}$/;

/** Pripona z mena suboru - len ak je bezpecna, inak "bin". */
export function safeExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
  return EXT.test(ext) ? ext : "bin";
}

/** Novy nahodny kluc v danom priecinku, napr. newKey(["projects", id], "stl"). */
export function newKey(folder: string[], ext: string): string {
  if (folder.length === 0 || !folder.every((s) => SEGMENT.test(s))) {
    throw new Error("Invalid storage folder");
  }
  if (!EXT.test(ext)) throw new Error("Invalid file extension");
  return `${folder.join("/")}/${randomUUID()}.${ext}`;
}

/**
 * Kluc -> absolutna cesta. Druha poistka popri newKey(): aj keby sa do DB
 * nejako dostal podvrhnuty kluc, cesta nesmie opustit storageRoot.
 */
export function resolveKey(key: string, root = storageRoot()): string {
  const base = path.resolve(root);
  const full = path.resolve(base, key);
  if (!full.startsWith(base + path.sep)) throw new Error("Invalid file key");
  return full;
}

export function mimeForKey(key: string): string | null {
  return INLINE_MIME[safeExt(key)] ?? null;
}

/**
 * Zapise stream na disk. Limit sa kontroluje POCAS zapisu (nie az po nom),
 * takze obrovsky subor nezaplni disk. Zapisuje sa do .part a az nakoniec
 * sa premenuje - pad uprostred nezanecha polovicny subor pod platnym klucom.
 */
export async function saveStream(
  key: string,
  body: ReadableStream<Uint8Array>,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<number> {
  const full = resolveKey(key);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.part`;

  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) cb(new TooLargeError("File is larger than the allowed limit"));
      else cb(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
      limiter,
      fs.createWriteStream(tmp, { flags: "wx" }),
    );
    await fsp.rename(tmp, full);
    return size;
  } catch (err) {
    await fsp.rm(tmp, { force: true });
    throw err;
  }
}

export async function saveBuffer(key: string, data: Uint8Array): Promise<void> {
  const full = resolveKey(key);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.part`;
  try {
    await fsp.writeFile(tmp, data, { flag: "wx" });
    await fsp.rename(tmp, full);
  } catch (err) {
    await fsp.rm(tmp, { force: true });
    throw err;
  }
}

export async function openRead(
  key: string,
): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null> {
  try {
    const full = resolveKey(key);
    const st = await fsp.stat(full);
    if (!st.isFile()) return null;
    return {
      size: st.size,
      stream: Readable.toWeb(fs.createReadStream(full)) as ReadableStream<Uint8Array>,
    };
  } catch {
    return null;
  }
}

/**
 * Mazanie je best-effort: ked zlyha (subor drzi antivirus, uz neexistuje),
 * zaznam v DB sa aj tak odstrani. Osireli subor neskor zmaze cleanupOrphans().
 */
export async function removeKeys(keys: (string | null | undefined)[]): Promise<void> {
  await Promise.all(
    keys
      .filter((k): k is string => Boolean(k))
      .map(async (key) => {
        try {
          await fsp.rm(resolveKey(key), { force: true });
        } catch (err) {
          console.error("Failed to delete file:", key, err);
        }
      }),
  );
}

/** Vsetky kluce na disku (pre upratovanie osirelych suborov). */
export async function listStoredKeys(
  root = storageRoot(),
): Promise<{ key: string; mtimeMs: number }[]> {
  const out: { key: string; mtimeMs: number }[] = [];
  async function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) {
        const st = await fsp.stat(full);
        out.push({ key: path.relative(root, full).split(path.sep).join("/"), mtimeMs: st.mtimeMs });
      }
    }
  }
  await walk(root);
  return out;
}
