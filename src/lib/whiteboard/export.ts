import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import { desktop } from "@/lib/desktop";

type SceneArgs = {
  elements: readonly unknown[];
  files: unknown;
  dark: boolean;
  name: string;
};

const appStateFor = (dark: boolean) => ({
  exportBackground: true,
  exportWithDarkMode: dark,
  viewBackgroundColor: dark ? "#0e1116" : "#ffffff",
  exportPadding: 24,
});

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "mapa";

export async function exportPng({ elements, files, dark, name }: SceneArgs) {
  const blob = await exportToBlob({
    // Excalidraw typy su tu prisne; nase ulozene elementy su kompatibilne.
    elements: elements as never,
    files: files as never,
    appState: appStateFor(dark),
    mimeType: "image/png",
    quality: 1,
  });
  triggerDownload(blob, `${safeName(name)}.png`);
}

export async function exportSvgFile({ elements, files, dark, name }: SceneArgs) {
  const svg = await exportToSvg({
    elements: elements as never,
    files: files as never,
    appState: appStateFor(dark),
  });
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
    type: "image/svg+xml",
  });
  triggerDownload(blob, `${safeName(name)}.svg`);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * PDF = PNG mapy vytlaceny do PDF.
 * Desktop: Electron (skryte okno bez JS + printToPDF + dialog Ulozit ako).
 * Prehliadac (vyvoj): nova stranka + tlacovy dialog.
 */
export async function exportPdf({ elements, files, dark, name }: SceneArgs) {
  const blob = await exportToBlob({
    elements: elements as never,
    files: files as never,
    appState: appStateFor(dark),
    mimeType: "image/png",
    quality: 1,
  });

  const bridge = desktop();
  if (bridge) {
    await bridge.imageToPdf(await blobToDataUrl(blob), safeName(name));
    return;
  }

  const url = URL.createObjectURL(blob);
  const w = window.open("", "_blank");
  if (!w) {
    triggerDownload(blob, `${safeName(name)}.png`);
    return;
  }
  w.document.write(
    `<title>${name}</title><style>body{margin:0}img{width:100%}@media print{@page{margin:12mm}}</style>` +
      `<img src="${url}" onload="window.print()">`,
  );
  w.document.close();
}

/**
 * Maly nahlad do galerie map. Zamerne vzdy na svetlom pozadi - v tmavej
 * galerii je citatelnejsi a je to standard (Figma, Miro). Vracia Blob.
 */
export async function renderThumbnail({
  elements,
  files,
}: Omit<SceneArgs, "name" | "dark">): Promise<Blob | null> {
  if (!Array.isArray(elements) || elements.length === 0) return null;
  try {
    return await exportToBlob({
      elements: elements as never,
      files: files as never,
      appState: {
        exportBackground: true,
        exportWithDarkMode: false,
        viewBackgroundColor: "#ffffff",
        exportPadding: 16,
      },
      mimeType: "image/webp",
      quality: 0.7,
      getDimensions: (w: number, h: number) => {
        const scale = Math.min(1, 640 / Math.max(w, h));
        return { width: w * scale, height: h * scale, scale };
      },
    });
  } catch (err) {
    console.error("Failed to create map thumbnail:", err);
    return null;
  }
}
