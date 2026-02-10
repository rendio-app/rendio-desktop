import path from "node:path";
import { app, BrowserWindow } from "electron";
import started from "electron-squirrel-startup";
import { ensureAccessibility, setupSelectionHandlers } from "./main/selection";
import {
  registerShortcut,
  setupShortcutHandlers,
  unregisterAllShortcuts,
} from "./main/shortcut";
import { setupSettingsHandlers } from "./main/store";
import { setupTranslatorHandlers } from "./main/translator";

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

// Register IPC handlers once at module level (before any windows are created).
// Using a getter ensures handlers always reference the current window.
setupTranslatorHandlers(() => mainWindow);
setupSelectionHandlers();
setupSettingsHandlers(() => {
  if (mainWindow) {
    registerShortcut(mainWindow);
  }
});
setupShortcutHandlers(() => mainWindow);

const createWindow = () => {
  // Prompt for macOS Accessibility permission (shows native dialog on first run)
  ensureAccessibility();

  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    minWidth: 400,
    minHeight: 350,
    icon: path.join(__dirname, "../../icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  registerShortcut(mainWindow);
};

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("will-quit", () => {
  unregisterAllShortcuts();
});
