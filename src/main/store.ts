import fs from "node:fs";
import path from "node:path";
import { app, ipcMain } from "electron";
import { IpcChannels, type Settings, settingsSchema } from "../types";

const settingsPath = path.join(app.getPath("userData"), "settings.json");

const defaultSettings: Settings = settingsSchema.parse({});

export function getSettings(): Settings {
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const parsed = settingsSchema.partial().safeParse(JSON.parse(raw));
    if (parsed.success) {
      return { ...defaultSettings, ...parsed.data };
    }
  } catch {
    // File doesn't exist or is invalid — use defaults
  }
  return { ...defaultSettings };
}

function saveSettings(settings: Settings): void {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

export function setupSettingsHandlers(
  onSettingsSaved?: (settings: Settings) => void,
): void {
  ipcMain.handle(IpcChannels.SETTINGS_GET, () => {
    return getSettings();
  });

  ipcMain.handle(IpcChannels.SETTINGS_SET, (_event, settings: Settings) => {
    saveSettings(settings);
    onSettingsSaved?.(settings);
  });
}
