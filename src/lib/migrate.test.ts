import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listMigrations, runMigrations } from "./migrate";

const REAL_MIGRATIONS = path.join(process.cwd(), "prisma", "migrations");

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hf-migrate-"));
  process.env.HF_DATA_DIR = tmp;
});
afterEach(() => {
  // Ak by migrator nechal DB otvorenu, Windows by tu hodil EPERM
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.HF_DATA_DIR;
});

function copyMigrations(target: string, extra?: { name: string; sql: string }) {
  fs.cpSync(REAL_MIGRATIONS, target, { recursive: true });
  if (extra) {
    fs.mkdirSync(path.join(target, extra.name));
    fs.writeFileSync(path.join(target, extra.name, "migration.sql"), extra.sql);
  }
}

function query<T>(file: string, sql: string): T[] {
  const db = new DatabaseSync(file);
  try {
    return db.prepare(sql).all() as T[];
  } finally {
    db.close();
  }
}

function exec(file: string, sql: string) {
  const db = new DatabaseSync(file);
  try {
    db.exec(sql);
  } finally {
    db.close();
  }
}

describe("runMigrations", () => {
  it("založí novú databázu so všetkými tabuľkami", () => {
    const file = path.join(tmp, "hf.db");
    const result = runMigrations(file, REAL_MIGRATIONS);

    expect(result.created).toBe(true);
    expect(result.applied).toEqual(listMigrations(REAL_MIGRATIONS));
    const tables = query<{ name: string }>(file, "SELECT name FROM sqlite_master WHERE type = 'table'").map(
      (r) => r.name,
    );
    expect(tables).toEqual(
      expect.arrayContaining(["Project", "Task", "Part", "FileAsset", "Whiteboard", "_hf_migrations"]),
    );
  });

  it("druhé spustenie nič nerobí a nezálohuje", () => {
    const file = path.join(tmp, "hf.db");
    runMigrations(file, REAL_MIGRATIONS);
    const again = runMigrations(file, REAL_MIGRATIONS);

    expect(again).toEqual({ created: false, applied: [] });
    expect(fs.existsSync(path.join(tmp, "backups"))).toBe(false);
  });

  it("pred novou migráciou zálohuje a dáta zachová", () => {
    const file = path.join(tmp, "hf.db");
    const dir = path.join(tmp, "migrations");
    copyMigrations(dir);
    runMigrations(file, dir);
    exec(
      file,
      `INSERT INTO "Project" ("id","slug","title","updatedAt") VALUES ('p1','led','LED hodiny', datetime('now'))`,
    );

    copyMigrations(dir, { name: "99999999999999_extra", sql: 'ALTER TABLE "Project" ADD COLUMN "extra" TEXT;' });
    const result = runMigrations(file, dir);

    expect(result.applied).toEqual(["99999999999999_extra"]);
    const backups = fs.readdirSync(path.join(tmp, "backups"));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^before-update-.*\.db$/);
    // zaloha obsahuje data spred migracie
    const backupFile = path.join(tmp, "backups", backups[0]);
    expect(query<{ title: string }>(backupFile, `SELECT title FROM "Project"`)).toEqual([{ title: "LED hodiny" }]);

    expect(query<{ title: string }>(file, `SELECT title FROM "Project"`)).toEqual([{ title: "LED hodiny" }]);
  });

  it("chybná migrácia sa celá vráti späť", () => {
    const file = path.join(tmp, "hf.db");
    const dir = path.join(tmp, "migrations");
    copyMigrations(dir);
    runMigrations(file, dir);

    copyMigrations(dir, {
      name: "99999999999999_zla",
      sql: 'ALTER TABLE "Project" ADD COLUMN "a" TEXT; TOTO NIE JE SQL;',
    });
    expect(() => runMigrations(file, dir)).toThrow();

    const cols = query<{ name: string }>(file, `PRAGMA table_info("Project")`).map((c) => c.name);
    expect(cols).not.toContain("a");
    expect(query(file, `SELECT name FROM "_hf_migrations"`)).toHaveLength(
      listMigrations(REAL_MIGRATIONS).length,
    );
  });

  it("odmietne databázu z novšej verzie appky", () => {
    const file = path.join(tmp, "hf.db");
    runMigrations(file, REAL_MIGRATIONS);
    exec(file, `INSERT INTO "_hf_migrations" VALUES ('99999999999999_buducnost', 'x')`);

    expect(() => runMigrations(file, REAL_MIGRATIONS)).toThrow(/newer version/);
  });

  it("nepodarená nová databáza po sebe nenechá súbor", () => {
    const file = path.join(tmp, "hf.db");
    const dir = path.join(tmp, "migrations");
    fs.mkdirSync(path.join(dir, "0001_zla"), { recursive: true });
    fs.writeFileSync(path.join(dir, "0001_zla", "migration.sql"), "NEPLATNE SQL;");

    expect(() => runMigrations(file, dir)).toThrow();
    expect(fs.existsSync(file)).toBe(false);
  });
});
