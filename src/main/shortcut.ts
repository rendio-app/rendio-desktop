import { type BrowserWindow, globalShortcut, ipcMain } from "electron";
import { IpcChannels } from "../types";
import { getSelectionText } from "./selection";
import { getSettings } from "./store";

export function registerShortcut(win: BrowserWindow): void {
  globalShortcut.unregisterAll();

  const settings = getSettings();
  const key = settings.shortcutKey;

  if (!key) return;

  globalShortcut.register(key, async () => {
    const text = await getSelectionText();
    win.show();
    win.focus();
    if (text) {
      win.webContents.send(IpcChannels.SELECTION_TEXT, text);
    }
  });
}

export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll();
}

export function setupShortcutHandlers(
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(IpcChannels.SHORTCUT_SUSPEND, () => {
    globalShortcut.unregisterAll();
  });

  ipcMain.handle(IpcChannels.SHORTCUT_RESUME, () => {
    const win = getWindow();
    if (win) {
      registerShortcut(win);
    }
  });
}
