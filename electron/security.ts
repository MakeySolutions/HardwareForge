import path from "node:path";
import { app, shell, type Session } from "electron";
import { externalUrl, isAllowedRequest, isAppUrl } from "./navigation";

/**
 * Bezpecnostne nastavenia session a okien (Electron security checklist).
 */

/**
 * Jedine opravnenia, ktore appka potrebuje: cela obrazovka (mapy), kopirovanie
 * a citanie schranky (Ctrl+V obrazka do mapy - Excalidraw pri vkladani zo
 * schranky interne siaha aj po navigator.clipboard.read(), nielen po
 * clipboardData z udalosti "paste"). Cita sa vzdy len obsah, ktory tam
 * pouzivatel sam skopiroval, a len v reakcii na jeho vlastny Ctrl+V.
 */
const ALLOWED_PERMISSIONS = new Set(["fullscreen", "clipboard-sanitized-write", "clipboard-read"]);

/**
 * Content-Security-Policy pre stranky appky. 'unsafe-inline' pre skripty
 * vyzaduje Next.js (inline bootstrap). connect-src 'self' = ziadne volania
 * mimo appky ani keby sa do nej dostal cudzi skript.
 *
 * 'wasm-unsafe-eval' povoluje LEN kompilaciu WebAssembly (nie JS eval()).
 * Potrebuje ho Excalidraw: velke obrazky (tlacidlo "Obrazok", drag & drop,
 * Ctrl+V) pri vkladani zmensuje kniznicou pica cez WebAssembly - bez toho
 * sa obrazok potichu nevlozi.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

export function openExternal(url: string): void {
  const safe = externalUrl(url);
  if (safe) void shell.openExternal(safe);
}

export function hardenSession(
  ses: Session,
  getOrigin: () => string,
  onBlocked: (url: string) => void,
  allowDevtools: boolean,
): void {
  // Kontrola pravopisu by stahovala slovniky z Google CDN
  ses.setSpellCheckerEnabled(false);

  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));

  // Appka nesmie ist na internet - vsetko mimo lokalneho servera sa zrusi
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isAllowedRequest(details.url, getOrigin(), allowDevtools);
    if (!allowed) onBlocked(details.url);
    callback({ cancel: !allowed });
  });

  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    const hasCsp = Object.keys(headers).some((k) => k.toLowerCase() === "content-security-policy");
    if (isAppUrl(details.url, getOrigin()) && !hasCsp) {
      headers["Content-Security-Policy"] = [CSP];
    }
    callback({ responseHeaders: headers });
  });

  // Stiahnutie (subor, CSV, export mapy) -> dialog "Ulozit ako"
  ses.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({
      title: "Save File",
      defaultPath: path.join(app.getPath("downloads"), item.getFilename()),
    });
  });
}

/** Zamkne navigaciu vsetkych okien na lokalny server appky. */
export function hardenWebContents(getOrigin: () => string): void {
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (e) => e.preventDefault());

    contents.on("will-navigate", (e, url) => {
      if (isAppUrl(url, getOrigin())) return;
      e.preventDefault();
      openExternal(url);
    });

    contents.on("will-redirect", (e, url) => {
      if (!isAppUrl(url, getOrigin())) e.preventDefault();
    });

    // target="_blank" / window.open: stranka appky sa otvori v tom istom okne,
    // externy odkaz v systemovom prehliadaci. Nove okna appka nevytvara.
    contents.setWindowOpenHandler(({ url }) => {
      if (isAppUrl(url, getOrigin())) void contents.loadURL(url);
      else openExternal(url);
      return { action: "deny" };
    });
  });
}
