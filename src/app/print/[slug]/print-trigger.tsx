"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { desktop, desktopStore } from "@/lib/desktop";

/**
 * Lista nad tlacovou verziou projektu.
 * Desktop: "Uložiť PDF" -> Electron printToPDF + dialog Ulozit ako.
 * Prehliadac (vyvoj): tlacovy dialog, v nom "Uložiť ako PDF".
 */
export function PrintTrigger({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const isDesktop = useSyncExternalStore(
    desktopStore.subscribe,
    desktopStore.getSnapshot,
    desktopStore.getServerSnapshot,
  );

  useEffect(() => {
    if (desktop()) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  async function savePdf() {
    const bridge = desktop();
    if (!bridge) return window.print();
    setBusy(true);
    try {
      if (await bridge.savePdf(name)) toast.success("PDF saved");
    } catch {
      toast.error("Failed to save PDF");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-6 py-3">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="size-3.5" />
        Back
      </Button>
      <div className="flex items-center gap-3">
        {!isDesktop && (
          <p className="text-sm text-[var(--text-muted)]">
            In the print dialog, choose <strong className="text-[var(--text)]">Save as PDF</strong>.
          </p>
        )}
        <Button variant="primary" size="sm" onClick={() => void savePdf()} disabled={busy}>
          {isDesktop ? <FileDown className="size-3.5" /> : <Printer className="size-3.5" />}
          {isDesktop ? "Save PDF" : "Print"}
        </Button>
      </div>
    </div>
  );
}
