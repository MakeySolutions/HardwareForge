import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { backupsDir, dbPath, migrationsDir } from "./paths";

/**
 * Migracie databazy pri starte appky.
 *
 * Prisma CLI (migrate deploy) sa do instalatora nebali - je velke a potrebuje
 * vlastne binarky. SQL subory z prisma/migrations vsak staci aplikovat
 * v poradi a zapamatat si, ktore uz prebehli. To robi tento modul.
 *
 * Pouziva vstavany node:sqlite (nie libSQL ako Prisma): jeho close() subor
 * naozaj uvolni. libSQL drzi subor otvoreny az do garbage collection, co na
 * Windows blokuje mazanie a premenovanie (obnova zo zalohy).
 *
 * Bezpecnost dat:
 *  - pred kazdou migraciou existujucej DB sa urobi kopia do backups/
 *  - kazda migracia bezi v transakcii (bud cela, alebo vobec)
 *  - DB z NOVSEJ verzie appky sa neotvori (downgrade by ju mohol poskodit)
 */

const TABLE = "_hf_migrations";
const KEEP_BACKUPS = 5;

export type MigrationResult = { created: boolean; applied: string[] };

export function listMigrations(dir = migrationsDir()): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort();
}

/** Retazec pre SQL literal ('...'). Pouziva sa len pre cestu k zalohe. */
const sqlString = (s: string) => `'${s.replaceAll("'", "''")}'`;

/** Konzistentna kopia DB aj pocas behu (VACUUM INTO, nie kopirovanie suboru). */
export function snapshotDatabase(db: DatabaseSync, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.rmSync(target, { force: true });
  db.exec(`VACUUM INTO ${sqlString(target)}`);
}

export function runMigrations(file = dbPath(), dir = migrationsDir()): MigrationResult {
  const created = !fs.existsSync(file);
  const available = listMigrations(dir);
  const db = new DatabaseSync(file);
  let closed = false;
  const close = () => {
    if (!closed) {
      closed = true;
      db.close();
    }
  };

  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(
      `CREATE TABLE IF NOT EXISTS "${TABLE}" ("name" TEXT PRIMARY KEY, "appliedAt" TEXT NOT NULL)`,
    );
    const rows = db.prepare(`SELECT "name" FROM "${TABLE}"`).all() as { name: string }[];
    const done = new Set(rows.map((r) => r.name));

    if ([...done].some((n) => !available.includes(n))) {
      throw new Error(
        "This database comes from a newer version of HardwareForge. Please install the latest version of the app.",
      );
    }

    const pending = available.filter((n) => !done.has(n));
    if (pending.length === 0) return { created, applied: [] };
    if (done.size > 0) backupBeforeMigration(db);

    // PRAGMA foreign_keys sa v transakcii ignoruje, preto sa prepina mimo nej.
    // Prisma pri zmene tabulky v SQLite tabulku kopiruje - cudzie kluce
    // sa overia az po migracii (foreign_key_check).
    db.exec("PRAGMA foreign_keys = OFF");
    for (const name of pending) {
      const sql = fs.readFileSync(path.join(dir, name, "migration.sql"), "utf8");
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec(sql);
        const violations = db.prepare("PRAGMA foreign_key_check").all();
        if (violations.length) throw new Error(`Migration ${name} violated data relationships`);
        db.prepare(`INSERT INTO "${TABLE}" ("name", "appliedAt") VALUES (?, ?)`).run(
          name,
          new Date().toISOString(),
        );
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    }
    db.exec("PRAGMA foreign_keys = ON");

    return { created, applied: pending };
  } catch (err) {
    close();
    // Nova DB, ktora sa nepodarila zalozit -> zmazat, dalsi start zacne nacisto
    if (created) {
      for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
    }
    throw err;
  } finally {
    close();
  }
}

function backupBeforeMigration(db: DatabaseSync) {
  const dir = backupsDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  snapshotDatabase(db, path.join(dir, `before-update-${stamp}.db`));

  const old = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("before-update-") && f.endsWith(".db"))
    .sort();
  for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) {
    fs.rmSync(path.join(dir, f), { force: true });
  }
}
