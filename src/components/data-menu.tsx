"use client";

import { useSyncExternalStore } from "react";
import { ArchiveRestore, FolderOpen, HardDriveDownload } from "lucide-react";
import { desktop, desktopStore } from "@/lib/desktop";

/** Zalohy a priecinok s datami - len v desktop appke. */
export function DataMenu() {
  const isDesktop = useSyncExternalStore(
    desktopStore.subscribe,
    desktopStore.getSnapshot,
    desktopStore.getServerSnapshot,
  );
  if (!isDesktop) return null;

  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]";

  return (
    <div className="mt-auto space-y-0.5 border-t border-[var(--border)] pt-3">
      <p className="px-3 pb-1 text-[11px] font-medium tracking-wide text-[var(--text-muted)] uppercase">
        Data
      </p>
      <button className={item} onClick={() => void desktop()?.backup()}>
        <HardDriveDownload className="size-4" />
        Back Up
      </button>
      <button className={item} onClick={() => void desktop()?.restore()}>
        <ArchiveRestore className="size-4" />
        Restore from Backup
      </button>
      <button className={item} onClick={() => void desktop()?.openDataFolder()}>
        <FolderOpen className="size-4" />
        Data Folder
      </button>
    </div>
  );
}
