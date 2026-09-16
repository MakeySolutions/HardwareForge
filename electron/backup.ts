import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";
import yauzl from "yauzl";

/**
 * Zaloha = jeden ZIP:
 *   manifest.json        - co je to za subor a z akej verzie
 *   hardwareforge.db     - konzistentna kopia databazy (VACUUM INTO)
 *   files/...            - nahrate subory, obrazky map a suciastok
 *
 * Obnova je navrhnuta tak, aby zly alebo podvrhnuty ZIP nemohol nic pokazit:
 *   - kazda cesta v ZIP-e sa overi (ziadne "..", absolutne cesty, "\")
 *     -> "zip slip" nezapise subor mimo cieloveho priecinka
 *   - limit poctu suborov a celkovej velkosti -> "zip bomba" nezaplni disk
 *   - rozbaluje sa do docasneho priecinka, DB sa overi (integrity_check)
 *   - az potom sa vymeni za aktualne data; stare data sa presunu, nemazu
 */

export const BACKUP_FORMAT = 1;
export const DB_NAME = "hardwareforge.db";
const MANIFEST = "manifest.json";

export const LIMITS = { maxEntries: 200_000, maxTotalBytes: 50 * 1024 ** 3 };

export type Manifest = {
  app: "HardwareForge";
  format: number;
  createdAt: string;
  appVersion: string;
};

/** Smie tato cesta z ZIP-u existovat v zalohe? */
export function isSafeEntryName(name: string): boolean {
  if (!name || name.length > 500) return false;
  if (name.includes("\\") || name.includes("\0") || name.includes(":")) return false;
  if (name.startsWith("/")) return false;

  const parts = name.split("/");
  const isDir = name.endsWith("/");
  const segments = isDir ? parts.slice(0, -1) : parts;
  if (segments.some((s) => s === "" || s === "." || s === "..")) return false;

  if (!isDir && (name === DB_NAME || name === MANIFEST)) return true;
  return segments[0] === "files" && (isDir || segments.length >= 2);
}

async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
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
      // .part = prave nahravany/nedokonceny subor, do zalohy nepatri
      else if (e.isFile() && !e.name.endsWith(".part")) out.push(path.relative(root, full));
    }
  }
  await walk(root);
  return out;
}

export async function createBackup(o: {
  dataDir: string;
  target: string;
  appVersion: string;
  snapshotDb: (target: string) => void;
}): Promise<void> {
  const tmpDb = path.join(o.dataDir, `.backup-${randomUUID()}.db`);
  const partial = `${o.target}.part`;

  try {
    o.snapshotDb(tmpDb);

    const zip = new yazl.ZipFile();
    const manifest: Manifest = {
      app: "HardwareForge",
      format: BACKUP_FORMAT,
      createdAt: new Date().toISOString(),
      appVersion: o.appVersion,
    };
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), MANIFEST);
    zip.addFile(tmpDb, DB_NAME);

    const filesDir = path.join(o.dataDir, "files");
    for (const rel of await listFiles(filesDir)) {
      zip.addFile(path.join(filesDir, rel), `files/${rel.split(path.sep).join("/")}`);
    }
    zip.end();

    await fsp.mkdir(path.dirname(o.target), { recursive: true });
    await pipeline(zip.outputStream, fs.createWriteStream(partial));
    await fsp.rename(partial, o.target);
  } finally {
    await fsp.rm(tmpDb, { force: true });
    await fsp.rm(partial, { force: true });
  }
}

// ------------------------------------------------------------------ obnova

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      file,
      { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true },
      (err, zip) => (err || !zip ? reject(err ?? new Error("ZIP file could not be opened")) : resolve(zip)),
    );
  });
}

function nextEntry(zip: yauzl.ZipFile): Promise<yauzl.Entry | null> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      zip.off("entry", onEntry);
      zip.off("end", onEnd);
      zip.off("error", onError);
    };
    const onEntry = (entry: yauzl.Entry) => {
      cleanup();
      resolve(entry);
    };
    const onEnd = () => {
      cleanup();
      resolve(null);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    zip.on("entry", onEntry);
    zip.on("end", onEnd);
    zip.on("error", onError);
    zip.readEntry();
  });
}

function openEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) =>
      err || !stream ? reject(err ?? new Error("File inside ZIP could not be read")) : resolve(stream),
    );
  });
}

export async function extractBackup(zipPath: string, destDir: string): Promise<void> {
  const root = path.resolve(destDir);
  await fsp.mkdir(root, { recursive: true });
  const zip = await openZip(zipPath);

  try {
    if (zip.entryCount > LIMITS.maxEntries) throw new Error("Backup contains too many files");

    let total = 0;
    const seen = new Set<string>();
    for (let entry = await nextEntry(zip); entry; entry = await nextEntry(zip)) {
      const name = entry.fileName;
      if (!isSafeEntryName(name)) throw new Error(`Backup contains an invalid path: ${name}`);
      if (name.endsWith("/")) continue;
      if (seen.has(name)) throw new Error(`Backup contains a duplicate file: ${name}`);
      seen.add(name);

      total += entry.uncompressedSize;
      if (total > LIMITS.maxTotalBytes) throw new Error("Backup is suspiciously large");

      const out = path.resolve(root, ...name.split("/"));
      if (!out.startsWith(root + path.sep)) throw new Error(`Invalid path: ${name}`);

      await fsp.mkdir(path.dirname(out), { recursive: true });
      await pipeline(await openEntry(zip, entry), fs.createWriteStream(out, { flags: "wx" }));
    }
  } finally {
    zip.close();
  }
}

/**
 * Rozbali a overi zalohu do docasneho priecinka. Aktualne data sa zatial
 * nemenia - pri akejkolvek chybe staci docasny priecinok zmazat.
 */
export async function prepareRestore(
  zipPath: string,
  staging: string,
  verifyDb: (dbFile: string) => void,
): Promise<Manifest> {
  await fsp.rm(staging, { recursive: true, force: true });
  await extractBackup(zipPath, staging);

  let manifest: Manifest;
  try {
    manifest = JSON.parse(await fsp.readFile(path.join(staging, MANIFEST), "utf8"));
  } catch {
    throw new Error("This file is not a HardwareForge backup (missing manifest)");
  }
  if (manifest?.app !== "HardwareForge" || manifest.format !== BACKUP_FORMAT) {
    throw new Error("This file is not a HardwareForge backup, or is from an unsupported version");
  }

  const db = path.join(staging, DB_NAME);
  if (!fs.existsSync(db)) throw new Error("The backup is missing its database");
  verifyDb(db);

  await fsp.rm(path.join(staging, MANIFEST), { force: true });
  return manifest;
}

/**
 * Vymeni data za obnovene. Stare data sa NEMAZU - presunu sa vedla
 * (data-before-restore-<cas>), aby sa dali v pripade potreby vratit.
 * Server musi byt pred volanim zastaveny (Windows zamyka otvorenu DB).
 */
export function swapInRestoredData(dataDir: string, staging: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const previous = `${dataDir}-before-restore-${stamp}`;
  if (fs.existsSync(dataDir)) fs.renameSync(dataDir, previous);
  fs.renameSync(staging, dataDir);
  return previous;
}
