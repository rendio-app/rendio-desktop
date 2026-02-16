import path from "node:path";
import { app, BrowserWindow, Menu, nativeImage, Tray } from "electron";
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
let tray: Tray | null = null;
let isQuitting = false;

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

function createTray(): void {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "iconTemplate.png")
    : path.join(__dirname, "../../src/assets/iconTemplate.png");
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip("Rendio");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Rendio",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}

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

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  registerShortcut(mainWindow);
};

app.on("ready", () => {
  if (process.platform === "darwin") {
    app.dock.hide();
  }
  createTray();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  unregisterAllShortcuts();
});
