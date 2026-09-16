import { runMigrations } from "./lib/migrate";
import { seedDemoProject } from "./lib/seed-demo";
import { cleanupOrphans } from "./lib/storage-cleanup";

/** Migracie DB -> ukazkovy projekt (len pri uplne novej DB) -> upratanie suborov. */
export async function startup() {
  const { created, applied } = runMigrations();
  if (applied.length) console.info(`[db] applied migrations: ${applied.join(", ")}`);

  if (created) await seedDemoProject();

  cleanupOrphans()
    .then((n) => n && console.info(`[storage] deleted ${n} orphaned files`))
    .catch((err) => console.error("[storage] cleanup failed:", err));
}
