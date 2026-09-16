import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  utilityProcess,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type UtilityProcess,
} from "electron";
import { createBackup, prepareRestore, swapInRestoredData, DB_NAME } from "./backup";
import { isAppUrl } from "./navigation";
import { hardenSession, hardenWebContents, openExternal } from "./security";

/**
 * Hlavny proces HardwareForge.
 *
 *  1. vyberie volny port na 127.0.0.1 a vygeneruje nahodny token
 *  2. spusti Next.js server (standalone) v oddelenom procese
 *  3. otvori okno s tokenom v httpOnly cookie
 *
 * Token sa nikam nezapisuje - bez neho server odmietne kazdy request
 * (src/lib/guard.ts), takze ina appka ani webstranka k datam nepristupi.
 */

const APP_NAME = "HardwareForge";
const REPO_URL = "https://github.com/hardwareforge/hardwareforge";
const TOKEN_COOKIE = "hf_token";
const isDev = !app.isPackaged;

app.setName(APP_NAME);
app.enableSandbox();

// Iny priecinok s datami (E2E testy, prenosna instalacia). Riadi ho len
// pouzivatel cez vlastne prostredie - stranka appky ho zmenit nevie.
if (process.env.HF_USER_DATA_DIR) app.setPath("userData", process.env.HF_USER_DATA_DIR);

const userData = app.getPath("userData");
const dataDir = path.join(userData, "data");
const logsDir = path.join(userData, "logs");
const serverDir = isDev
  ? path.join(app.getAppPath(), ".next", "standalone")
  : path.join(process.resourcesPath, "server");
const migrationsDir = isDev
  ? path.join(app.getAppPath(), "prisma", "migrations")
  : path.join(process.resourcesPath, "migrations");

const token = randomBytes(32).toString("hex");
let origin = "";
let server: UtilityProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let quitting = false;

// ------------------------------------------------------------------ server

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Priecinok Dokumenty pre ulozenie zaloh a PDF. Ak je presmerovany na OneDrive,
 * ktory momentalne nie je pripojeny/synchronizovany, cesta nemusi na disku
 * existovat - natívny dialóg by na nej hlásil "Súbor sa nenašiel".
 */
function documentsDir(): string {
  const dir = app.getPath("documents");
  return fs.existsSync(dir) ? dir : userData;
}

function serverLogPath() {
  return path.join(logsDir, "server.log");
}

function lastLogLines(n = 15): string {
  try {
    return fs.readFileSync(serverLogPath(), "utf8").trim().split(/\r?\n/).slice(-n).join("\n");
  } catch {
    return "";
  }
}

async function startServer(): Promise<void> {
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;

  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(serverLogPath())) {
    fs.renameSync(serverLogPath(), path.join(logsDir, "server.previous.log"));
  }
  const log = fs.createWriteStream(serverLogPath(), { flags: "a" });

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== "NODE_OPTIONS" && k !== "ELECTRON_RUN_AS_NODE") env[k] = v;
  }

  const child = utilityProcess.fork(path.join(serverDir, "server.js"), [], {
    cwd: serverDir,
    stdio: "pipe",
    serviceName: `${APP_NAME} Server`,
    env: {
      ...env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      HF_APP_TOKEN: token,
      HF_DATA_DIR: dataDir,
      HF_MIGRATIONS_DIR: migrationsDir,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  server = child;
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);

  let exitCode: number | null = null;
  child.once("exit", (code) => {
    exitCode = code;
    server = null;
    if (!quitting && mainWindow) {
      dialog.showErrorBox(
        "HardwareForge stopped unexpectedly",
        `Your data is safe. Restart the app.\n\n${lastLogLines()}`,
      );
      app.exit(1);
    }
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exitCode !== null) throw new Error(`Server exited (code ${exitCode}).`);
    try {
      const res = await fetch(`${origin}/api/health`, {
        headers: { cookie: `${TOKEN_COOKIE}=${token}` },
      });
      if (res.ok) return;
    } catch {
      /* server este nepocuva */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server did not start within 60 seconds.");
}

function stopServer(): Promise<void> {
  const child = server;
  if (!child) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

// ------------------------------------------------------------------ databaza (zalohy)

/**
 * Vstavany node:sqlite - bez natívnych balikov a jeho close() subor naozaj
 * uvolni (Windows by inak nedovolil premenovat priecinok pri obnove).
 */
function openDatabase(file: string): DatabaseSync {
  return new DatabaseSync(file);
}

function snapshotDatabase(target: string) {
  const db = openDatabase(path.join(dataDir, DB_NAME));
  try {
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  } finally {
    db.close();
  }
}

function verifyDatabase(file: string) {
  const db = openDatabase(file);
  try {
    const check = db.prepare("PRAGMA integrity_check").all() as Record<string, unknown>[];
    if (Object.values(check[0] ?? {})[0] !== "ok") throw new Error("The database in the backup is corrupted");
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_hf_migrations'")
      .all();
    if (table.length === 0) throw new Error("This file is not a HardwareForge database");
  } finally {
    db.close();
  }
}

// ------------------------------------------------------------------ akcie

async function backupData() {
  const win = mainWindow ?? undefined;
  const stamp = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(win!, {
    title: "Save Backup",
    defaultPath: path.join(documentsDir(), `HardwareForge-backup-${stamp}.zip`),
    filters: [{ name: "HardwareForge Backup", extensions: ["zip"] }],
  });
  if (canceled || !filePath) return;

  try {
    await createBackup({
      dataDir,
      target: filePath,
      appVersion: app.getVersion(),
      snapshotDb: snapshotDatabase,
    });
    await dialog.showMessageBox(win!, {
      type: "info",
      message: "Backup complete",
      detail: `Saved to:\n${filePath}\n\nKeep a copy somewhere else too (a USB stick, a cloud drive).`,
    });
  } catch (err) {
    dialog.showErrorBox("Backup failed", err instanceof Error ? err.message : String(err));
  }
}

async function restoreData() {
  const win = mainWindow ?? undefined;
  const { response } = await dialog.showMessageBox(win!, {
    type: "warning",
    buttons: ["Choose Backup…", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    message: "Restore data from a backup?",
    detail:
      "Your current projects and files will be replaced with the backup's contents. Nothing is deleted — your current data is moved into a “data-before-restore-…” folder.",
  });
  if (response !== 0) return;

  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    title: "Choose Backup",
    properties: ["openFile"],
    filters: [{ name: "HardwareForge Backup", extensions: ["zip"] }],
  });
  if (canceled || !filePaths[0]) return;

  const staging = path.join(userData, `data-restore-${Date.now()}`);
  try {
    await prepareRestore(filePaths[0], staging, verifyDatabase);
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    dialog.showErrorBox("Backup could not be restored", err instanceof Error ? err.message : String(err));
    return;
  }

  quitting = true;
  await stopServer();
  try {
    swapInRestoredData(dataDir, staging);
  } catch (err) {
    dialog.showErrorBox(
      "Restore failed",
      `${err instanceof Error ? err.message : String(err)}\n\nYour original data was left unchanged.`,
    );
  }
  app.relaunch();
  app.exit(0);
}

async function openDataFolder() {
  await shell.openPath(dataDir);
}

function showAbout() {
  void dialog
    .showMessageBox(mainWindow!, {
      type: "info",
      title: `About ${APP_NAME}`,
      message: `${APP_NAME} ${app.getVersion()}`,
      detail:
        "Hardware project planning. All data is stored only on this computer — the app never connects to the internet.\n\nLicense: MIT.",
      buttons: ["Close", "Source Code on GitHub"],
      cancelId: 0,
    })
    .then(({ response }) => {
      if (response === 1) openExternal(REPO_URL);
    });
}

// ------------------------------------------------------------------ IPC

/** Volanie IPC prijmeme len zo stranky nasej appky. */
function fromApp(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url;
  return Boolean(url) && isAppUrl(url!, origin);
}

function safeFileName(name: unknown, ext: string): string {
  const base = String(name ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "export"}.${ext}`;
}

async function savePdfBuffer(e: IpcMainInvokeEvent, name: unknown, pdf: () => Promise<Buffer>) {
  const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
  const { canceled, filePath } = await dialog.showSaveDialog(win!, {
    title: "Save PDF",
    defaultPath: path.join(documentsDir(), safeFileName(name, "pdf")),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return false;
  await fs.promises.writeFile(filePath, await pdf());
  return true;
}

const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;

function registerIpc() {
  ipcMain.handle("hf:open-external", (e, url: unknown) => {
    if (!fromApp(e) || typeof url !== "string") return false;
    openExternal(url);
    return true;
  });

  ipcMain.handle("hf:save-pdf", async (e, name: unknown) => {
    if (!fromApp(e)) return false;
    return savePdfBuffer(e, name, () =>
      e.sender.printToPDF({ printBackground: true, pageSize: "A4" }),
    );
  });

  // Mapa -> PDF: PNG obrazok v skrytom okne bez JavaScriptu, vytlaceny do PDF
  ipcMain.handle("hf:image-to-pdf", async (e, dataUrl: unknown, name: unknown) => {
    if (!fromApp(e) || typeof dataUrl !== "string") return false;
    if (dataUrl.length > 80 * 1024 * 1024 || !PNG_DATA_URL.test(dataUrl)) return false;

    return savePdfBuffer(e, name, async () => {
      const printer = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
      });
      try {
        const html =
          "<!doctype html><style>@page{margin:12mm}html,body{margin:0}img{width:100%}</style>" +
          `<img src="${dataUrl}">`;
        await printer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        return await printer.webContents.printToPDF({ printBackground: true, landscape: true });
      } finally {
        printer.destroy();
      }
    });
  });

  ipcMain.handle("hf:backup", (e) => (fromApp(e) ? backupData() : undefined));
  ipcMain.handle("hf:restore", (e) => (fromApp(e) ? restoreData() : undefined));
  ipcMain.handle("hf:open-data-folder", (e) => (fromApp(e) ? openDataFolder() : undefined));
}

// ------------------------------------------------------------------ okno a menu

function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        { label: "Back Up Data…", accelerator: "CmdOrCtrl+Shift+S", click: () => void backupData() },
        { label: "Restore from Backup…", click: () => void restoreData() },
        { label: "Open Data Folder", click: () => void openDataFolder() },
        { type: "separator" },
        { label: "Quit", role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", role: "undo" },
        { label: "Redo", role: "redo" },
        { type: "separator" },
        { label: "Cut", role: "cut" },
        { label: "Copy", role: "copy" },
        { label: "Paste", role: "paste" },
        { label: "Select All", role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Reload", role: "reload" },
        { type: "separator" },
        { label: "Zoom In", role: "zoomIn" },
        { label: "Zoom Out", role: "zoomOut" },
        { label: "Actual Size", role: "resetZoom" },
        { type: "separator" },
        { label: "Toggle Full Screen", role: "togglefullscreen" },
        ...(isDev ? [{ role: "toggleDevTools" } as MenuItemConstructorOptions] : []),
      ],
    },
    {
      label: "Help",
      submenu: [{ label: `About ${APP_NAME}`, click: showAbout }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  await session.defaultSession.cookies.set({
    url: origin,
    name: TOKEN_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "strict",
    // bez expirationDate = session cookie, nezapisuje sa na disk
  });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: APP_NAME,
    backgroundColor: "#0e1116",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: isDev,
      plugins: true, // vstavany prehliadac PDF v sekcii Subory
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // Editor mapy blokuje odchod pri neulozenych zmenach (beforeunload).
  // Electron na to ziadny dialog neukaze - okno by sa potichu nezavrelo.
  mainWindow.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: "question",
      buttons: ["Close", "Stay"],
      defaultId: 1,
      cancelId: 1,
      message: "This map has unsaved changes",
      detail: "It auto-saves in a moment. If you close now, the latest changes may be lost.",
    });
    // preventDefault tu znamena "ignorovat beforeunload a zavriet"
    if (choice === 0) event.preventDefault();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  await mainWindow.loadURL(`${origin}/dashboard`);
}

// ------------------------------------------------------------------ start

if (!app.requestSingleInstanceLock()) {
  // Druha instancia by otvorila tu istu databazu - radsej len ukazeme prvu
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  hardenWebContents(() => origin);

  app.whenReady().then(async () => {
    try {
      hardenSession(
        session.defaultSession,
        () => origin,
        (url) => console.warn(`[blocked] ${url}`),
        isDev,
      );
      registerIpc();
      buildMenu();
      await startServer();
      await createWindow();
    } catch (err) {
      quitting = true;
      await stopServer();
      dialog.showErrorBox(
        `${APP_NAME} failed to start`,
        `${err instanceof Error ? err.message : String(err)}\n\n${lastLogLines()}\n\nLog file: ${serverLogPath()}`,
      );
      app.exit(1);
    }
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("will-quit", (e) => {
    if (!server) return;
    e.preventDefault();
    void stopServer().then(() => app.quit());
  });
}
