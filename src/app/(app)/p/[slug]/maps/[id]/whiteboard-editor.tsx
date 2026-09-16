"use client";

import dynamic from "next/dynamic";

/**
 * Editor je cisto klientsky (Excalidraw cita `document`, `window`, canvas).
 * Tento wrapper drzi `ssr: false` hranicu, aby sa nic z neho nerenderovalo
 * na serveri a nevznikali hydratacne nezhody (tema, velkost platna).
 */
export const WhiteboardEditor = dynamic(
  () => import("./whiteboard-editor.impl").then((m) => m.WhiteboardEditor),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-40 grid place-items-center bg-[var(--bg)] text-sm text-[var(--text-muted)]">
        Loading map…
      </div>
    ),
  },
);
