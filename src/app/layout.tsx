import type { Metadata } from "next";
// Fonty su lokalne subory z balika `geist` - build ani appka nic nestahuju z Google Fonts
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "HardwareForge",
  description: "Hardware project planning — ESP32, Arduino, 3D printing, electronics",
};

/**
 * Nastavi temu este pred prvym paintom, inak by pri svetlej teme
 * problikla tmava (FOUC).
 *
 * EXCALIDRAW_ASSET_PATH: fonty editora map sa nacitaju z appky
 * (public/excalidraw-assets, kopiruje ich postinstall), nie z CDN.
 *
 * File System Access API (showOpenFilePicker...) sa vypne: v Electrone by
 * citanie vybraneho suboru vyzadovalo opravnenie "fileSystem", ktore appka
 * zamerne nepovoluje.
 *
 * Klavesa "9" (vstavany nastroj Excalidrawu "Vlozit obrazok") sa blokuje
 * skor, nez ju stihne zachytit samotny Excalidraw - jeho vlastny listener
 * sa pripoji az po hydratacii (komponent je dynamic/ssr:false), tento
 * skript uz bezi pri nacitani stranky, takze ho vzdy predbehne. Tlacidlo
 * v paneli nastrojov sa skryva v globals.css; nahradza ich vlastne
 * tlacidlo "Obrazok" v hlavicke editora mapy.
 */
const THEME_SCRIPT = `
window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
try {
  ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"].forEach(function (k) {
    delete window[k];
    if (window.Window && Window.prototype) delete Window.prototype[k];
  });
} catch (e) {}
try {
  window.addEventListener("keydown", function (e) {
    if (e.key !== "9" || e.ctrlKey || e.metaKey || e.altKey) return;
    var a = document.activeElement;
    var editing = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
    if (!editing && document.querySelector(".excalidraw")) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
} catch (e) {}
try {
  var t = localStorage.getItem('hf-theme');
  if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              color: "var(--text)",
            },
          }}
        />
      </body>
    </html>
  );
}
