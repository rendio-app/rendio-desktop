import fs from "node:fs";
import path from "node:path";
import { app, ipcMain } from "electron";
import {
  IpcChannels,
  type ModelInfo,
  type Settings,
  settingsSchema,
} from "../types";

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

function deriveModelsUrl(apiEndpoint: string): string {
  try {
    const url = new URL(apiEndpoint);
    url.pathname = url.pathname.replace(/\/chat\/completions$/, "/models");
    return url.toString();
  } catch {
    return apiEndpoint.replace(/\/chat\/completions$/, "/models");
  }
}

async function fetchModels(
  apiEndpoint: string,
  apiKey: string,
): Promise<ModelInfo[]> {
  const modelsUrl = deriveModelsUrl(apiEndpoint);
  const response = await fetch(modelsUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  const json = await response.json();
  return (json.data ?? []).map((m: { id: string; owned_by?: string }) => ({
    id: m.id,
    owned_by: m.owned_by ?? "",
  }));
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

  ipcMain.handle(
    IpcChannels.MODELS_GET,
    (_event, apiEndpoint: string, apiKey: string) => {
      return fetchModels(apiEndpoint, apiKey);
    },
  );
}
