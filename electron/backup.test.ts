import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBackup, extractBackup, isSafeEntryName, prepareRestore } from "./backup";

describe("isSafeEntryName", () => {
  it("povolí len očakávanú štruktúru zálohy", () => {
    expect(isSafeEntryName("hardwareforge.db")).toBe(true);
    expect(isSafeEntryName("manifest.json")).toBe(true);
    expect(isSafeEntryName("files/projects/abc/1.stl")).toBe(true);
    expect(isSafeEntryName("files/")).toBe(true);
    expect(isSafeEntryName("files/parts/")).toBe(true);
  });

  it("odmietne zip slip a cudzie súbory", () => {
    expect(isSafeEntryName("../evil.exe")).toBe(false);
    expect(isSafeEntryName("files/../../evil.exe")).toBe(false);
    expect(isSafeEntryName("files/./x")).toBe(false);
    expect(isSafeEntryName("/etc/passwd")).toBe(false);
    expect(isSafeEntryName("C:/Windows/evil.dll")).toBe(false);
    expect(isSafeEntryName("files\\..\\evil")).toBe(false);
    expect(isSafeEntryName("files//x")).toBe(false);
    expect(isSafeEntryName("files")).toBe(false);
    expect(isSafeEntryName("autorun.inf")).toBe(false);
    expect(isSafeEntryName("hardwareforge.db/")).toBe(false);
    expect(isSafeEntryName("")).toBe(false);
  });
});

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hf-backup-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function writeZip(target: string, entries: Record<string, string>) {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(entries)) zip.addBuffer(Buffer.from(content), name);
  zip.end();
  await pipeline(zip.outputStream, fs.createWriteStream(target));
}

describe("createBackup + prepareRestore", () => {
  it("záloha sa dá obnoviť 1:1", async () => {
    const data = path.join(tmp, "data");
    fs.mkdirSync(path.join(data, "files", "projects", "p1"), { recursive: true });
    fs.writeFileSync(path.join(data, "files", "projects", "p1", "a.stl"), "solid test");
    fs.writeFileSync(path.join(data, "files", "projects", "p1", "b.bin.part"), "nedokoncene");
    const zipPath = path.join(tmp, "zaloha.zip");

    await createBackup({
      dataDir: data,
      target: zipPath,
      appVersion: "0.1.0",
      snapshotDb: (t) => fs.writeFileSync(t, "SQLITE-SNAPSHOT"),
    });
    // docasna kopia DB po sebe nic nenechala
    expect(fs.readdirSync(data).filter((f) => f.startsWith(".backup-"))).toEqual([]);

    const staging = path.join(tmp, "staging");
    let verified = "";
    const manifest = await prepareRestore(zipPath, staging, (db) => {
      verified = fs.readFileSync(db, "utf8");
    });

    expect(manifest.app).toBe("HardwareForge");
    expect(verified).toBe("SQLITE-SNAPSHOT");
    expect(fs.readFileSync(path.join(staging, "files", "projects", "p1", "a.stl"), "utf8")).toBe("solid test");
    expect(fs.existsSync(path.join(staging, "files", "projects", "p1", "b.bin.part"))).toBe(false);
    expect(fs.existsSync(path.join(staging, "manifest.json"))).toBe(false);
  });

  it("odmietne ZIP, ktorý nie je záloha", async () => {
    const zipPath = path.join(tmp, "cudzi.zip");
    await writeZip(zipPath, { "hardwareforge.db": "x", "manifest.json": '{"app":"Iny"}' });
    await expect(prepareRestore(zipPath, path.join(tmp, "s"), () => {})).rejects.toThrow(/not a HardwareForge backup/);
  });

  it("odmietne ZIP s cestou mimo priečinka a nič nezapíše mimo", async () => {
    const zipPath = path.join(tmp, "zly.zip");
    // yazl odmietne vytvorit ZIP s "..", tak ho podvrhneme ako utocnik:
    // rovnako dlhy nazov a nahradenie bajtov v hotovom subore
    await writeZip(zipPath, { "files/ok.txt": "ok", "files/sub/AA/AA/AA/unik.txt": "zle" });
    const evil = fs.readFileSync(zipPath).toString("latin1").replaceAll("AA/AA/AA", "../../..");
    fs.writeFileSync(zipPath, Buffer.from(evil, "latin1"));
    const dest = path.join(tmp, "dest");
    await expect(extractBackup(zipPath, dest)).rejects.toThrow();
    expect(fs.existsSync(path.join(tmp, "unik.txt"))).toBe(false);
  });

  it("odmietne neočakávaný súbor v zálohe", async () => {
    const zipPath = path.join(tmp, "navyse.zip");
    await writeZip(zipPath, { "hardwareforge.db": "x", "virus.exe": "MZ" });
    await expect(extractBackup(zipPath, path.join(tmp, "d"))).rejects.toThrow(/invalid path/);
  });
});
