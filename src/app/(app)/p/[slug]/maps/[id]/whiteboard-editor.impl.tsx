"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadToApp } from "@/lib/upload-client";
import {
  ArrowLeft,
  Check,
  Download,
  ImagePlus,
  Link2,
  Loader2,
  Maximize2,
  Minimize2,
  Moon,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import "@excalidraw/excalidraw/index.css";

import { renameWhiteboard, saveWhiteboard } from "@/server/whiteboards";
import type { WhiteboardLinkData } from "@/server/queries";
import type { HfCardData } from "@/lib/whiteboard/cards";
import {
  createWhiteboardEngine,
  type SaveState,
  type WhiteboardEngine,
} from "@/lib/whiteboard/engine";
import { Button } from "@/components/ui";
import { LinkPanel } from "./link-panel";
import { CardInspector } from "./card-inspector";
import { ExportMenu } from "./export-menu";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((m) => m.Excalidraw),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center text-sm text-[var(--text-muted)]">
        Loading editor…
      </div>
    ),
  },
);

type Props = {
  slug: string;
  whiteboard: {
    id: string;
    title: string;
    elements: unknown[];
    appState: Record<string, unknown> | null;
    files: { fileId: string; url: string; mimeType: string }[];
  };
  template: string | null;
  linkData: WhiteboardLinkData;
};

export function WhiteboardEditor({ slug, whiteboard, template, linkData }: Props) {
  const router = useRouter();

  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [title, setTitle] = useState(whiteboard.title);
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<HfCardData | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Tema tejto mapy - nezavisla od globalnej temy appky. Ak si ju
  // pouzivatel uz raz nastavil (ulozene v appState), ta ma prednost;
  // inak sa mapa riadi tym, co aktualne ukazuje cely web.
  const [dark, setDark] = useState<boolean>(() => {
    const saved = whiteboard.appState?.theme;
    if (saved === "dark") return true;
    if (saved === "light") return false;
    // Editor je ssr:false, takze document tu vzdy existuje.
    return document.documentElement.getAttribute("data-theme") !== "light";
  });

  // linkData sa mení po router.refresh() - engine ho číta cez ref, aktualizuje effect
  const linkDataRef = useRef(linkData);

  // Engine sa vytvorí raz. useState s lazy inicializátorom = stabilná hodnota,
  // ktorú je bezpečné čítať počas renderu (na rozdiel od ref.current).
  const [engine] = useState<WhiteboardEngine>(() =>
    createWhiteboardEngine({
      whiteboardId: whiteboard.id,
      storedFiles: whiteboard.files,
      template,
      dark,
      getLinkData: () => linkDataRef.current,
      actions: {
        saveWhiteboard,
        uploadThumbnail: async (blob) => {
          await uploadToApp({ target: "map-thumb", whiteboardId: whiteboard.id }, blob);
        },
      },
      onSaveState: setSaveState,
      onSelectCard: setSelectedCard,
    }),
  );

  // po zmene linkData (napr. po zmene stavu v inšpektore): prefarbi karty
  useEffect(() => {
    linkDataRef.current = linkData;
    engine.resync();
  }, [engine, linkData]);

  // Prepnutie tmavej/svetlej pre TUTO mapu. Ulozi sa hned (nezavisi od
  // autosave elementov), aby volba pretrvala aj po reloade.
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    engine.setTheme(next);
  };

  // uloženie a upozornenie pri odchode
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (engine.isDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const onFocus = () => router.refresh();
    window.addEventListener("beforeunload", warn);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("focus", onFocus);
      void engine.flush();
    };
  }, [engine, router]);

  const initialData = {
    elements: whiteboard.elements as never,
    appState: {
      ...(whiteboard.appState ?? {}),
      currentItemRoughness: 0,
      currentItemFontFamily: 2,
      viewBackgroundColor: dark ? "#0e1116" : "#ffffff",
    },
    scrollToContent: true,
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => setFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setFullscreen(false))
        .catch(() => {});
    }
  };

  const commitTitle = () => {
    const t = title.trim();
    if (t && t !== whiteboard.title) void renameWhiteboard(whiteboard.id, t);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--bg)]">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] px-2 md:px-3">
        <Link
          href={`/p/${slug}/maps`}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Mapy</span>
        </Link>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label="Map title"
          className="focus-ring min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-sm font-medium"
        />

        <SaveBadge state={saveState} />

        <Button
          variant={linkOpen ? "primary" : "secondary"}
          size="sm"
          onClick={() => setLinkOpen((v) => !v)}
        >
          <Link2 className="size-3.5" />
          <span className="hidden sm:inline">Link</span>
        </Button>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = ""; // umožní znova vybrať ten istý súbor
            if (files.length === 0) return;
            void engine.insertImages(files);
            toast.success(files.length === 1 ? "Image added" : `${files.length} images added`);
          }}
        />
        <Button variant="secondary" size="sm" onClick={() => imageInputRef.current?.click()}>
          <ImagePlus className="size-3.5" />
          <span className="hidden sm:inline">Image</span>
        </Button>

        <ExportMenu getScene={() => ({ ...engine.getScene(), name: title })}>
          <Button variant="secondary" size="sm">
            <Download className="size-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </ExportMenu>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={dark ? "Light map theme" : "Dark map theme"}
          title={dark ? "Light map theme" : "Dark map theme"}
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleFullscreen}
          aria-label="Full Screen"
        >
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      </header>

      <div className="relative min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={(api: unknown) => void engine.onApiReady(api)}
          initialData={initialData}
          onChange={engine.onChange as never}
          theme={dark ? "dark" : "light"}
          name={title}
          // POZOR: UIOptions.tools.image: false by vypol AJ drag&drop a Ctrl+V
          // vkladanie obrazkov (Excalidraw to riadi jednym spolocnym flagom),
          // preto sa tu nepouziva. Vstavane tlacidlo/skratka "9" sa skryva
          // a blokuje inak - viz globals.css a inline skript v layout.tsx.
        />

        {selectedCard && (
          <CardInspector
            card={selectedCard}
            linkData={linkData}
            slug={slug}
            onChanged={() => router.refresh()}
          />
        )}
      </div>

      {linkOpen && (
        <LinkPanel
          linkData={linkData}
          onClose={() => setLinkOpen(false)}
          onPick={(kind, id) => {
            void engine.addCard(kind, id);
            toast.success(
              kind === "task" ? "Task added to map" : "Part added to map",
            );
          }}
        />
      )}
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <span className="flex items-center gap-1 px-1 text-[11px] text-[var(--text-muted)]">
        <Loader2 className="size-3 animate-spin" /> Saving…
      </span>
    );
  if (state === "saved")
    return (
      <span className="flex items-center gap-1 px-1 text-[11px] text-[var(--text-muted)]">
        <Check className="size-3" /> Saved
      </span>
    );
  if (state === "error")
    return <span className="px-1 text-[11px] text-red-400">Save error</span>;
  return <span className="px-1 text-[11px] text-[var(--text-muted)]">Unsaved</span>;
}
